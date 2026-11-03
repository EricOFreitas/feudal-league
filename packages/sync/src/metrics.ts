/**
 * Treino, etapa T1 (docs/TREINO.md): números objetivos por partida e benchmarks por divisão.
 *
 * O worker lê a gravação das partidas de liga sozinho (collectLeagueMetrics), sem chamar a IA:
 * custa o download do replay e 0,1 s de CPU. A análise pedida pelo jogador também grava (storeMatchMetrics).
 * Benchmark = quartis dos últimos 90 dias de partidas 1v1 dos jogadores da divisão.
 */
import { db, divisions, leagueMatches, leagueMembers, leagues, matchMetrics, players, seasons } from '@aoe2/db';
import { and, desc, eq, gt, inArray, isNull, notExists, sql } from 'drizzle-orm';
import { alias, type PgColumn } from 'drizzle-orm/pg-core';
import { AnalyzerError, parseReplay, type ParseOut } from './analyzer';

/** Partidas na divisão (90 dias) antes de mostrar comparação. */
export const BENCHMARK_MIN_SAMPLES = 30;
const BENCHMARK_DAYS = 90;
/** Partidas de liga lidas por ciclo do worker (5 min) e idade máxima; depois disso a gravação costuma ter sumido. */
const METRICS_PER_CYCLE = Number(process.env.METRICS_PER_CYCLE ?? 20);
const METRICS_MAX_AGE_DAYS = Number(process.env.METRICS_MAX_AGE_DAYS ?? 14);
const PAUSE_MS = 2000;

export const METRIC_KEYS = ['feudalS', 'castleS', 'imperialS', 'vils10', 'vils15', 'vils20', 'tcIdleS', 'firstMilitaryS', 'apm'] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];
/** true = quanto menor melhor (tempos); false = quanto maior melhor (vilas, APM). */
export const LOWER_IS_BETTER: Record<MetricKey, boolean> = {
  feudalS: true, castleS: true, imperialS: true, vils10: false, vils15: false, vils20: false, tcIdleS: true, firstMilitaryS: true, apm: false,
};
export type MetricNumbers = Record<MetricKey, number | null>;
export type Quartiles = { p25: number; p50: number; p75: number };
export type DivisionBenchmark = { divisionId: number; samples: number; metrics: Record<MetricKey, Quartiles | null> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Números de um jogador a partir do resumo do analyzer; null se ele não foi identificado na gravação. */
export function metricsFromParse(parse: ParseOut, profileId: number): (MetricNumbers & { durationS: number; tcIdleUntilS: number | null }) | null {
  const slot = Object.entries(parse.slots).find(([, pid]) => pid === profileId)?.[0];
  const p = slot ? parse.players[slot] : undefined;
  if (!p) return null;
  // produzidas (fila do TC simulada até a Castelo), não pedidas: shift-queue pede 5 de uma vez
  const buckets = p.villagers_done_per_5min ?? p.villagers_only_per_5min ?? p.villagers_queued_per_5min;
  const upTo = (minutes: number) => (parse.duration_s < minutes * 60 ? null : buckets.slice(0, minutes / 5).reduce((a, b) => a + b, 0));
  const age = (k: 'feudal' | 'castle' | 'imperial') => p.ages[k]?.reached_s ?? null;
  return {
    durationS: parse.duration_s,
    feudalS: age('feudal'), castleS: age('castle'), imperialS: age('imperial'),
    vils10: upTo(10), vils15: upTo(15), vils20: upTo(20),
    tcIdleS: p.tc_idle_s ?? null, tcIdleUntilS: p.tc_idle_until_s ?? null,
    firstMilitaryS: p.first_military?.t_s ?? null,
    apm: Math.round(p.apm),
  };
}

/** Divisão atual na Liga Global de cada profile (só membros ativos em temporada aberta). */
export async function globalDivisionOf(profileIds: number[]): Promise<Map<number, number>> {
  if (profileIds.length === 0) return new Map();
  const rows = await db
    .select({ profileId: players.profileId, divisionId: leagueMembers.divisionId })
    .from(leagueMembers)
    .innerJoin(players, eq(players.id, leagueMembers.playerId))
    .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
    .innerJoin(seasons, eq(seasons.id, leagueMembers.seasonId))
    .where(and(inArray(players.profileId, profileIds), eq(leagues.isGlobal, true), isNull(leagueMembers.leftAt), isNull(seasons.endedAt)));
  return new Map(rows.map((r) => [r.profileId, r.divisionId]));
}

/**
 * Grava as métricas de cada participante identificado na gravação (só partidas 1v1).
 * Se já existe linha (ex.: colhida antes como unavailable), atualiza os números e mantém a origem.
 */
export async function storeMatchMetrics(
  match: { id: number; completedAt: Date; profileIds: number[] },
  parse: ParseOut,
  source: 'league' | 'analysis',
  divisionByProfile: Map<number, number | null>,
): Promise<number> {
  if (match.profileIds.length !== 2) return 0;
  let n = 0;
  for (const profileId of match.profileIds) {
    const m = metricsFromParse(parse, profileId);
    if (!m) continue;
    const values = {
      matchId: match.id, profileId, divisionId: divisionByProfile.get(profileId) ?? null, playedAt: match.completedAt, status: 'ok', error: null, source,
      durationS: m.durationS, feudalS: m.feudalS, castleS: m.castleS, imperialS: m.imperialS, vils10: m.vils10, vils15: m.vils15, vils20: m.vils20,
      tcIdleS: m.tcIdleS, tcIdleUntilS: m.tcIdleUntilS, firstMilitaryS: m.firstMilitaryS, apm: m.apm,
    };
    const { matchId: _m, profileId: _p, source: _s, ...update } = values;
    void _m; void _p; void _s;
    await db.insert(matchMetrics).values(values).onConflictDoUpdate({ target: [matchMetrics.matchId, matchMetrics.profileId], set: update });
    n++;
  }
  return n;
}

async function markMatch(match: { id: number; completedAt: Date; profileIds: number[] }, divisionId: number, status: 'unavailable' | 'failed', error: string | null) {
  await db
    .insert(matchMetrics)
    .values(match.profileIds.map((profileId) => ({ matchId: match.id, profileId, divisionId, playedAt: match.completedAt, status, error, source: 'league' })))
    .onConflictDoNothing();
}

/**
 * Lê a gravação das partidas de liga recentes ainda sem métricas (mais novas primeiro) e grava os números.
 * 404 do servidor do jogo = gravação sumiu: marca unavailable e não tenta de novo. Analyzer fora do ar: interrompe o lote.
 */
export async function collectLeagueMetrics(limit = METRICS_PER_CYCLE): Promise<{ parsed: number; unavailable: number; failed: number }> {
  const out = { parsed: 0, unavailable: 0, failed: 0 };
  if (limit <= 0) return out;
  const since = new Date(Date.now() - METRICS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const winner = alias(players, 'winner');
  const loser = alias(players, 'loser');
  const rows = await db
    .select({
      matchId: leagueMatches.matchId, divisionId: leagueMatches.divisionId, playedAt: leagueMatches.playedAt, isGlobal: leagues.isGlobal,
      winnerProfile: winner.profileId, loserProfile: loser.profileId,
    })
    .from(leagueMatches)
    .innerJoin(leagues, eq(leagues.id, leagueMatches.leagueId))
    .innerJoin(winner, eq(winner.id, leagueMatches.winnerPlayerId))
    .innerJoin(loser, eq(loser.id, leagueMatches.loserPlayerId))
    .where(and(
      eq(leagueMatches.status, 'counted'),
      gt(leagueMatches.playedAt, since),
      notExists(db.select({ one: sql`1` }).from(matchMetrics).where(eq(matchMetrics.matchId, leagueMatches.matchId))),
    ))
    .orderBy(desc(leagueMatches.playedAt), desc(leagues.isGlobal))
    .limit(limit * 2);

  // a mesma partida pode valer em mais de uma liga: a divisão guardada é a da Global quando houver
  const seen = new Set<number>();
  const todo = rows.filter((r) => { if (seen.has(r.matchId)) return false; seen.add(r.matchId); return true; }).slice(0, limit);

  for (const r of todo) {
    const match = { id: r.matchId, completedAt: r.playedAt, profileIds: [r.winnerProfile, r.loserProfile] };
    try {
      const parse = await parseReplay(r.matchId, match.profileIds);
      const division = new Map(match.profileIds.map((p) => [p, r.divisionId]));
      const n = await storeMatchMetrics(match, parse, 'league', division);
      if (n === 0) { await markMatch(match, r.divisionId, 'failed', 'jogadores não identificados na gravação'); out.failed++; }
      else out.parsed++;
    } catch (e) {
      if (e instanceof AnalyzerError && e.status === 404) { await markMatch(match, r.divisionId, 'unavailable', null); out.unavailable++; }
      else if (e instanceof AnalyzerError && (e.status === 413 || e.status === 422)) { await markMatch(match, r.divisionId, 'failed', e.message.slice(0, 300)); out.failed++; }
      else throw e;
    }
    await sleep(PAUSE_MS);
  }
  return out;
}

/* ───────────────────────── leitura ───────────────────────── */

export async function metricsOf(matchId: number, profileId: number) {
  return (await db.query.matchMetrics.findFirst({ where: and(eq(matchMetrics.matchId, matchId), eq(matchMetrics.profileId, profileId)) })) ?? null;
}

const COLUMNS: Record<MetricKey, PgColumn> = {
  feudalS: matchMetrics.feudalS, castleS: matchMetrics.castleS, imperialS: matchMetrics.imperialS,
  vils10: matchMetrics.vils10, vils15: matchMetrics.vils15, vils20: matchMetrics.vils20,
  tcIdleS: matchMetrics.tcIdleS, firstMilitaryS: matchMetrics.firstMilitaryS, apm: matchMetrics.apm,
};

/** Quartis por divisão de uma liga (últimos 90 dias, só linhas ok). divisionId → benchmark. */
export async function benchmarksForLeague(leagueId: number): Promise<Map<number, DivisionBenchmark>> {
  const since = new Date(Date.now() - BENCHMARK_DAYS * 24 * 60 * 60 * 1000);
  const sel: Record<string, unknown> = { divisionId: matchMetrics.divisionId, samples: sql<number>`count(*)::int` };
  for (const k of METRIC_KEYS) for (const p of [25, 50, 75]) {
    sel[`${k}_${p}`] = sql<number | null>`percentile_cont(${sql.raw(String(p / 100))}) within group (order by ${COLUMNS[k]})`;
  }
  const rows = (await db
    .select(sel as { divisionId: typeof matchMetrics.divisionId; samples: ReturnType<typeof sql<number>> })
    .from(matchMetrics)
    .where(and(
      eq(matchMetrics.status, 'ok'),
      gt(matchMetrics.playedAt, since),
      inArray(matchMetrics.divisionId, db.select({ id: divisions.id }).from(divisions).where(eq(divisions.leagueId, leagueId))),
    ))
    .groupBy(matchMetrics.divisionId)) as unknown as Record<string, number | null>[];
  const out = new Map<number, DivisionBenchmark>();
  for (const r of rows) {
    if (r.divisionId == null) continue;
    const metrics = {} as Record<MetricKey, Quartiles | null>;
    for (const k of METRIC_KEYS) {
      const p50 = r[`${k}_50`];
      metrics[k] = p50 == null ? null : { p25: Number(r[`${k}_25`]), p50: Number(p50), p75: Number(r[`${k}_75`]) };
    }
    out.set(r.divisionId, { divisionId: r.divisionId, samples: Number(r.samples), metrics });
  }
  return out;
}

/** Divisão imediatamente acima na mesma liga (null se já é a mais alta). */
export async function divisionAbove(divisionId: number) {
  const d = await db.query.divisions.findFirst({ where: eq(divisions.id, divisionId) });
  if (!d) return null;
  return (await db.query.divisions.findFirst({ where: and(eq(divisions.leagueId, d.leagueId), eq(divisions.sort, d.sort + 1)) })) ?? null;
}

/** Mediana das últimas N partidas 1v1 do jogador com gravação lida (página do jogador). */
export async function playerRecentMetrics(profileId: number, limit = 10): Promise<{ samples: number; medians: MetricNumbers }> {
  const rows = await db.query.matchMetrics.findMany({
    where: and(eq(matchMetrics.profileId, profileId), eq(matchMetrics.status, 'ok')),
    orderBy: [desc(matchMetrics.playedAt)], limit,
  });
  const medians = {} as MetricNumbers;
  for (const k of METRIC_KEYS) {
    const xs = rows.map((r) => r[k]).filter((v): v is number => v != null).sort((a, b) => a - b);
    const mid = Math.floor(xs.length / 2);
    medians[k] = xs.length === 0 ? null : xs.length % 2 ? xs[mid]! : Math.round((xs[mid - 1]! + xs[mid]!) / 2);
  }
  return { samples: rows.length, medians };
}
