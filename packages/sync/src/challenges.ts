/**
 * Treino, etapa T4 (docs/TREINO.md): desafio semanal com medalha.
 *
 * Uma métrica por semana, rodando CHALLENGE_METRICS; a meta é bater a mediana da PRÓPRIA divisão (benchmark de T1)
 * em CHALLENGE_MATCHES partidas de liga na semana. Conta sozinho: o worker já lê a gravação de toda partida de liga
 * (match_metrics), então não há custo de IA. Cumpriu → linha em challenge_awards → badge "challenger" no perfil.
 * Semana começa segunda 00:00 no horário de Brasília (03:00 UTC).
 */
import { challengeAwards, db, divisions, matchMetrics, players } from '@aoe2/db';
import { and, desc, eq, gte, inArray, isNotNull, lt } from 'drizzle-orm';
import { BENCHMARK_SHOW_SAMPLES, LOWER_IS_BETTER, benchmarksForLeague, type DivisionBenchmark, type MetricKey } from './metrics';

export const CHALLENGE_MATCHES = 3;
/** Ordem das semanas (mesma ordem de treino do foco; APM e Imperial ficam de fora: não são meta de uma semana). */
export const CHALLENGE_METRICS: MetricKey[] = ['tcIdleS', 'vils10', 'feudalS', 'vils15', 'castleS', 'firstMilitaryS'];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Segunda 02/11/2026 00:00 em Brasília = primeira semana de desafio (índice 0 = tcIdleS). */
const EPOCH = Date.UTC(2026, 10, 2, 3);

export type Challenge = { weekStart: Date; weekEnd: Date; /** YYYY-MM-DD da segunda */ key: string; metric: MetricKey };

/** Começo da semana de desafio que contém `at` (segunda 03:00 UTC). */
export function weekStartOf(at = new Date()): Date {
  const n = Math.floor((at.getTime() - EPOCH) / WEEK_MS);
  return new Date(EPOCH + n * WEEK_MS);
}

export function challengeOf(at = new Date()): Challenge {
  const weekStart = weekStartOf(at);
  const n = Math.round((weekStart.getTime() - EPOCH) / WEEK_MS);
  const metric = CHALLENGE_METRICS[((n % CHALLENGE_METRICS.length) + CHALLENGE_METRICS.length) % CHALLENGE_METRICS.length]!;
  return { weekStart, weekEnd: new Date(weekStart.getTime() + WEEK_MS), key: weekStart.toISOString().slice(0, 10), metric };
}

const beats = (metric: MetricKey, v: number, target: number) => (LOWER_IS_BETTER[metric] ? v < target : v > target);

/** Mediana da divisão na métrica, ou null se a divisão ainda não tem amostras suficientes. */
export function challengeTarget(bench: DivisionBenchmark | undefined, metric: MetricKey): number | null {
  if (!bench || bench.samples < BENCHMARK_SHOW_SAMPLES) return null;
  return bench.metrics[metric]?.p50 ?? null;
}

export type ChallengeMatch = { matchId: number; playedAt: Date; divisionId: number; value: number | null; target: number | null; ok: boolean };
export type ChallengeProgress = { done: number; needed: number; matches: ChallengeMatch[] };

type Row = { matchId: number; profileId: number; divisionId: number; playedAt: Date; value: number | null };

async function weekRows(ch: Challenge, profileId?: number): Promise<Row[]> {
  const col = { feudalS: matchMetrics.feudalS, castleS: matchMetrics.castleS, imperialS: matchMetrics.imperialS, vils10: matchMetrics.vils10, vils15: matchMetrics.vils15, vils20: matchMetrics.vils20, tcIdleS: matchMetrics.tcIdleS, firstMilitaryS: matchMetrics.firstMilitaryS, apm: matchMetrics.apm }[ch.metric];
  const rows = await db
    .select({ matchId: matchMetrics.matchId, profileId: matchMetrics.profileId, divisionId: matchMetrics.divisionId, playedAt: matchMetrics.playedAt, value: col })
    .from(matchMetrics)
    .where(and(
      eq(matchMetrics.status, 'ok'), isNotNull(matchMetrics.divisionId),
      gte(matchMetrics.playedAt, ch.weekStart), lt(matchMetrics.playedAt, ch.weekEnd),
      profileId != null ? eq(matchMetrics.profileId, profileId) : undefined,
    ))
    .orderBy(desc(matchMetrics.playedAt));
  return rows.map((r) => ({ ...r, divisionId: r.divisionId!, value: r.value == null ? null : Number(r.value) }));
}

/** divisionId → benchmark, pra todas as ligas das divisões pedidas (uma consulta por liga). */
async function benchFor(divisionIds: number[]): Promise<Map<number, DivisionBenchmark>> {
  const out = new Map<number, DivisionBenchmark>();
  if (divisionIds.length === 0) return out;
  const divs = await db.select({ id: divisions.id, leagueId: divisions.leagueId }).from(divisions).where(inArray(divisions.id, [...new Set(divisionIds)]));
  for (const leagueId of new Set(divs.map((d) => d.leagueId))) for (const [id, b] of await benchmarksForLeague(leagueId)) out.set(id, b);
  return out;
}

function evaluate(rows: Row[], ch: Challenge, bench: Map<number, DivisionBenchmark>): ChallengeMatch[] {
  return rows.map((r) => {
    const target = challengeTarget(bench.get(r.divisionId), ch.metric);
    return { matchId: r.matchId, playedAt: r.playedAt, divisionId: r.divisionId, value: r.value, target, ok: r.value != null && target != null && beats(ch.metric, r.value, target) };
  });
}

/** Progresso do jogador na semana do desafio (página Treino). */
export async function challengeProgress(profileId: number, ch = challengeOf()): Promise<ChallengeProgress> {
  const rows = await weekRows(ch, profileId);
  const matches = evaluate(rows, ch, await benchFor(rows.map((r) => r.divisionId)));
  return { done: Math.min(CHALLENGE_MATCHES, matches.filter((m) => m.ok).length), needed: CHALLENGE_MATCHES, matches };
}

/**
 * Concede o desafio a quem cumpriu (worker, a cada ciclo). Olha a semana atual e a anterior, porque a gravação
 * de domingo à noite pode ser lida na segunda. Idempotente (unique player+semana). Devolve quantas concessões novas.
 */
export async function awardChallenges(now = new Date()): Promise<number> {
  let n = 0;
  for (const ch of [challengeOf(now), challengeOf(new Date(now.getTime() - WEEK_MS))]) {
    const rows = await weekRows(ch);
    if (rows.length === 0) continue;
    const bench = await benchFor(rows.map((r) => r.divisionId));
    const byProfile = new Map<number, Row[]>();
    for (const r of rows) (byProfile.get(r.profileId) ?? byProfile.set(r.profileId, []).get(r.profileId)!).push(r);
    const done = [...byProfile].filter(([, rs]) => evaluate(rs, ch, bench).filter((m) => m.ok).length >= CHALLENGE_MATCHES);
    if (done.length === 0) continue;
    const ps = await db.select({ id: players.id, profileId: players.profileId }).from(players).where(inArray(players.profileId, done.map(([p]) => p)));
    const playerOf = new Map(ps.map((p) => [p.profileId, p.id]));
    const divs = await db.select({ id: divisions.id, leagueId: divisions.leagueId }).from(divisions).where(inArray(divisions.id, [...new Set(rows.map((r) => r.divisionId))]));
    const leagueOf = new Map(divs.map((d) => [d.id, d.leagueId]));
    for (const [profileId, rs] of done) {
      const playerId = playerOf.get(profileId);
      const divisionId = rs[0]!.divisionId;  // divisão da partida mais recente da semana
      const leagueId = leagueOf.get(divisionId);
      if (playerId == null || leagueId == null) continue;
      const ins = await db.insert(challengeAwards)
        .values({ playerId, leagueId, divisionId, weekStart: ch.key, metric: ch.metric, matches: evaluate(rs, ch, bench).filter((m) => m.ok).length })
        .onConflictDoNothing().returning({ id: challengeAwards.id });
      n += ins.length;
    }
  }
  return n;
}

/** Desafios cumpridos por um jogador, mais recente primeiro (perfil). */
export async function challengeAwardsOf(playerId: number) {
  return db.query.challengeAwards.findMany({ where: eq(challengeAwards.playerId, playerId), with: { division: true }, orderBy: [desc(challengeAwards.weekStart)] });
}

/** Quem cumpriu o desafio da semana numa divisão (página da liga). */
export async function challengeCompleters(divisionId: number, ch = challengeOf()) {
  return db.query.challengeAwards.findMany({
    where: and(eq(challengeAwards.divisionId, divisionId), eq(challengeAwards.weekStart, ch.key)),
    with: { player: { columns: { profileId: true, alias: true, country: true } } },
    orderBy: [desc(challengeAwards.awardedAt)],
  });
}
