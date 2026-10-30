/**
 * Regras de liga: divisões padrão, inscrição com checagem anti-smurf,
 * detecção de partidas entre membros e tabela de classificação.
 *
 * Pontuação: vitória 3, derrota 1. Desempate: vitórias, depois rating de colocação.
 */
import { RM_1V1 } from '@aoe2/aoe-api';
import {
  db, divisions, leagueMatches, leagueMembers, leagues, leagueWebhooks, matchMembers, matches, playerRatings, players, seasons, tournaments,
  type Division, type League, type PlayerRating, type Season,
} from '@aoe2/db';
import { and, asc, desc, eq, gt, ilike, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';

export const POINTS_WIN = 3;
export const POINTS_LOSS = 1;

/** Faixas padrão, medidas na ladder RM 1v1 em 29/10/2026 (46.882 ativos). */
export const DEFAULT_DIVISIONS: { nameKey: string; ratingMin: number; ratingMax: number | null }[] = [
  { nameKey: 'shield', ratingMin: 0, ratingMax: 899 },
  { nameKey: 'lance', ratingMin: 900, ratingMax: 1099 },
  { nameKey: 'banner', ratingMin: 1100, ratingMax: 1299 },
  { nameKey: 'tower', ratingMin: 1300, ratingMax: 1499 },
  { nameKey: 'castle', ratingMin: 1500, ratingMax: 1799 },
  { nameKey: 'crown', ratingMin: 1800, ratingMax: null },
];
export const DIVISION_KEYS = DEFAULT_DIVISIONS.map((d) => d.nameKey);

export const GLOBAL_SLUG = 'global';

export type NewLeagueInput = {
  slug: string; name: string; description?: string | null; ownerUserId: number; countRanked: boolean; minGames: number;
  divisions: { nameKey?: string | null; name?: string | null; ratingMin: number; ratingMax: number | null }[];
};

export async function createLeague(input: NewLeagueInput) {
  return db.transaction(async (tx) => {
    const [l] = await tx.insert(leagues).values({
      slug: input.slug, name: input.name, description: input.description ?? null, ownerUserId: input.ownerUserId,
      countRanked: input.countRanked, minGames: input.minGames,
    }).returning({ id: leagues.id });
    await tx.insert(seasons).values({ leagueId: l!.id, number: 1 });
    await tx.insert(divisions).values(input.divisions.map((d, i) => ({
      leagueId: l!.id, sort: i, nameKey: d.nameKey ?? null, name: d.name ?? null, ratingMin: d.ratingMin, ratingMax: d.ratingMax,
    })));
    return l!.id;
  });
}

export async function activeSeason(leagueId: number): Promise<Season | undefined> {
  return db.query.seasons.findFirst({ where: and(eq(seasons.leagueId, leagueId), isNull(seasons.endedAt)), orderBy: [desc(seasons.number)] });
}

/** Fecha a temporada atual e abre a próxima. Membros ativos são recolocados pelo rating máximo atual. */
export async function startNewSeason(leagueId: number) {
  const current = await activeSeason(leagueId);
  const divs = await db.query.divisions.findMany({ where: eq(divisions.leagueId, leagueId), orderBy: [asc(divisions.sort)] });
  const league = await db.query.leagues.findFirst({ where: eq(leagues.id, leagueId) });
  if (!league) throw new Error('liga não existe');
  return db.transaction(async (tx) => {
    const now = new Date();
    let nextNumber = 1;
    let active: { playerId: number }[] = [];
    if (current) {
      await tx.update(seasons).set({ endedAt: now }).where(eq(seasons.id, current.id));
      nextNumber = current.number + 1;
      active = await tx.select({ playerId: leagueMembers.playerId }).from(leagueMembers)
        .where(and(eq(leagueMembers.seasonId, current.id), isNull(leagueMembers.leftAt)));
    }
    const [s] = await tx.insert(seasons).values({ leagueId, number: nextNumber, startedAt: now }).returning({ id: seasons.id });
    if (active.length) {
      const ids = active.map((a) => a.playerId);
      const ratings = await tx.select().from(playerRatings).where(and(inArray(playerRatings.playerId, ids), eq(playerRatings.leaderboardId, RM_1V1)));
      const byPlayer = new Map(ratings.map((r) => [r.playerId, r]));
      const rows = [];
      for (const pid of ids) {
        const r = byPlayer.get(pid);
        const placement = placementFor(league, divs, r);
        if (!placement.ok) continue; // perdeu a faixa (ex.: sem partidas); fica de fora até reentrar
        rows.push({ leagueId, seasonId: s!.id, divisionId: placement.division.id, playerId: pid, placementRating: placement.rating, joinedAt: now });
      }
      if (rows.length) await tx.insert(leagueMembers).values(rows);
    }
    return s!.id;
  });
}

export type Placement =
  | { ok: true; division: Division; rating: number }
  | { ok: false; reason: 'no_rating' | 'few_games' | 'no_division'; rating: number; games: number };

/**
 * Escolhe a divisão pelo rating MÁXIMO histórico na RM 1v1 (anti-smurf) e exige mínimo de partidas.
 * Se a API não informa pico (0), usa o rating atual.
 */
export function placementFor(league: Pick<League, 'minGames'>, divs: Division[], r: PlayerRating | undefined): Placement {
  if (!r) return { ok: false, reason: 'no_rating', rating: 0, games: 0 };
  const games = r.wins + r.losses;
  const rating = Math.max(r.rating, r.highestRating);
  if (games < league.minGames) return { ok: false, reason: 'few_games', rating, games };
  const division = divs.find((d) => rating >= d.ratingMin && (d.ratingMax == null || rating <= d.ratingMax));
  if (!division) return { ok: false, reason: 'no_division', rating, games };
  return { ok: true, division, rating };
}

export type JoinResult =
  | { ok: true; memberId: number; division: Division }
  | { ok: false; reason: 'closed' | 'already' | 'no_rating' | 'few_games' | 'no_division' | 'no_season' };

export async function joinLeague(leagueId: number, playerId: number): Promise<JoinResult> {
  const league = await db.query.leagues.findFirst({ where: eq(leagues.id, leagueId) });
  if (!league || league.status !== 'open') return { ok: false, reason: 'closed' };
  const season = await activeSeason(leagueId);
  if (!season) return { ok: false, reason: 'no_season' };
  const existing = await db.query.leagueMembers.findFirst({ where: and(eq(leagueMembers.seasonId, season.id), eq(leagueMembers.playerId, playerId)) });
  if (existing && !existing.leftAt) return { ok: false, reason: 'already' };

  const divs = await db.query.divisions.findMany({ where: eq(divisions.leagueId, leagueId), orderBy: [asc(divisions.sort)] });
  const r = await db.query.playerRatings.findFirst({ where: and(eq(playerRatings.playerId, playerId), eq(playerRatings.leaderboardId, RM_1V1)) });
  const p = placementFor(league, divs, r);
  if (!p.ok) return { ok: false, reason: p.reason };

  if (existing) {
    // voltou: reativa na divisão atual
    await db.update(leagueMembers).set({ leftAt: null, divisionId: p.division.id, placementRating: p.rating, joinedAt: new Date() }).where(eq(leagueMembers.id, existing.id));
    return { ok: true, memberId: existing.id, division: p.division };
  }
  const [m] = await db.insert(leagueMembers).values({
    leagueId, seasonId: season.id, divisionId: p.division.id, playerId, placementRating: p.rating,
  }).returning({ id: leagueMembers.id });
  return { ok: true, memberId: m!.id, division: p.division };
}

export async function leaveLeague(leagueId: number, playerId: number) {
  const season = await activeSeason(leagueId);
  if (!season) return;
  await db.update(leagueMembers).set({ leftAt: new Date() })
    .where(and(eq(leagueMembers.seasonId, season.id), eq(leagueMembers.playerId, playerId), isNull(leagueMembers.leftAt)));
}

/** profile_ids de todos os membros ativos em ligas abertas (pro worker priorizar). */
export async function activeLeagueProfileIds(): Promise<number[]> {
  const rows = await db
    .selectDistinct({ profileId: players.profileId })
    .from(leagueMembers)
    .innerJoin(players, eq(players.id, leagueMembers.playerId))
    .innerJoin(seasons, eq(seasons.id, leagueMembers.seasonId))
    .where(and(isNull(leagueMembers.leftAt), isNull(seasons.endedAt)));
  return rows.map((r) => r.profileId);
}

const RM_1V1_MATCHTYPE = 6;
const LOBBY_MATCHTYPE = 0;

/**
 * Varre o histórico já gravado e registra partidas de liga: 1v1 (exatamente 2 participantes)
 * entre dois membros ativos da mesma divisão, jogada depois da inscrição dos dois.
 * Idempotente: (season, match) é único.
 */
export async function detectLeagueMatches(): Promise<number> {
  const openSeasons = await db.select({ season: seasons, league: leagues }).from(seasons)
    .innerJoin(leagues, eq(leagues.id, seasons.leagueId))
    .where(and(isNull(seasons.endedAt), inArray(leagues.status, ['open', 'closed'])));
  let created = 0;

  for (const { season, league } of openSeasons) {
    const members = await db
      .select({ id: leagueMembers.id, playerId: leagueMembers.playerId, divisionId: leagueMembers.divisionId, joinedAt: leagueMembers.joinedAt, profileId: players.profileId })
      .from(leagueMembers).innerJoin(players, eq(players.id, leagueMembers.playerId))
      .where(and(eq(leagueMembers.seasonId, season.id), isNull(leagueMembers.leftAt)));
    if (members.length < 2) continue;
    const byProfile = new Map(members.map((m) => [m.profileId, m]));
    const profileIds = members.map((m) => m.profileId);
    const types = league.countRanked ? [LOBBY_MATCHTYPE, RM_1V1_MATCHTYPE] : [LOBBY_MATCHTYPE];

    // partidas com exatamente 2 participantes, ambos membros, depois do início da temporada
    const candidates = await db
      .select({
        matchId: matchMembers.matchId,
        completedAt: matches.completedAt,
        profiles: sql<number[]>`array_agg(${matchMembers.profileId})`,
        outcomes: sql<number[]>`array_agg(${matchMembers.outcome})`,
      })
      .from(matchMembers)
      .innerJoin(matches, eq(matches.id, matchMembers.matchId))
      .where(and(
        inArray(matchMembers.profileId, profileIds),
        inArray(matches.matchtypeId, types),
        gt(matches.completedAt, season.startedAt),
        sql`(select count(*) from match_members x where x.match_id = "match_members"."match_id") = 2`,
      ))
      .groupBy(matchMembers.matchId, matches.completedAt)
      .having(sql`count(*) = 2`);
    if (candidates.length === 0) continue;

    const already = new Set(
      (await db.select({ matchId: leagueMatches.matchId }).from(leagueMatches)
        .where(and(eq(leagueMatches.seasonId, season.id), inArray(leagueMatches.matchId, candidates.map((c) => c.matchId))))).map((r) => r.matchId),
    );

    for (const c of candidates) {
      if (already.has(c.matchId)) continue;
      const [a, b] = [byProfile.get(c.profiles[0]!), byProfile.get(c.profiles[1]!)];
      if (!a || !b || a.divisionId !== b.divisionId) continue;
      if (c.completedAt < a.joinedAt || c.completedAt < b.joinedAt) continue;
      const [oa, ob] = [c.outcomes[0], c.outcomes[1]];
      if (!((oa === 1 && ob === 0) || (oa === 0 && ob === 1))) continue; // sem vencedor claro (drop, empate)
      const winner = oa === 1 ? a : b;
      const loser = oa === 1 ? b : a;
      await db.insert(leagueMatches).values({
        leagueId: league.id, seasonId: season.id, divisionId: a.divisionId, matchId: c.matchId,
        winnerPlayerId: winner.playerId, loserPlayerId: loser.playerId, playedAt: c.completedAt,
      }).onConflictDoNothing();
      created++;
    }
  }
  return created;
}

export type StandingRow = {
  playerId: number; profileId: number; alias: string; country: string | null;
  placementRating: number; wins: number; losses: number; points: number; joinedAt: Date;
};

/** Classificação de uma divisão numa temporada. */
export async function standings(seasonId: number, divisionId: number): Promise<StandingRow[]> {
  const wins = sql<number>`coalesce((select count(*) from ${leagueMatches} w where w.season_id = ${seasonId} and w.status = 'counted' and w.winner_player_id = "league_members"."player_id"), 0)::int`;
  const losses = sql<number>`coalesce((select count(*) from ${leagueMatches} l where l.season_id = ${seasonId} and l.status = 'counted' and l.loser_player_id = "league_members"."player_id"), 0)::int`;
  const rows = await db
    .select({
      playerId: leagueMembers.playerId, profileId: players.profileId, alias: players.alias, country: players.country,
      placementRating: leagueMembers.placementRating, joinedAt: leagueMembers.joinedAt, wins, losses,
    })
    .from(leagueMembers)
    .innerJoin(players, eq(players.id, leagueMembers.playerId))
    .where(and(eq(leagueMembers.seasonId, seasonId), eq(leagueMembers.divisionId, divisionId), isNull(leagueMembers.leftAt)));
  return rows
    .map((r) => ({ ...r, points: r.wins * POINTS_WIN + r.losses * POINTS_LOSS }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins || b.placementRating - a.placementRating || a.joinedAt.getTime() - b.joinedAt.getTime());
}

/** Últimas partidas da liga (ou de uma divisão), com os dois jogadores e a partida do jogo. */
export async function recentLeagueMatches(seasonId: number, divisionId?: number, limit = 20) {
  return db.query.leagueMatches.findMany({
    where: divisionId ? and(eq(leagueMatches.seasonId, seasonId), eq(leagueMatches.divisionId, divisionId)) : eq(leagueMatches.seasonId, seasonId),
    with: { winner: true, loser: true, match: { with: { members: true } }, division: true },
    orderBy: [desc(leagueMatches.playedAt)],
    limit,
  });
}

export async function voidLeagueMatch(leagueMatchId: number, reason: string | null) {
  await db.update(leagueMatches).set({ status: 'voided', voidReason: reason, updatedAt: new Date() }).where(eq(leagueMatches.id, leagueMatchId));
}
export async function restoreLeagueMatch(leagueMatchId: number) {
  await db.update(leagueMatches).set({ status: 'counted', voidReason: null, updatedAt: new Date() }).where(eq(leagueMatches.id, leagueMatchId));
}

/** Ligas visíveis na lista: global primeiro, depois abertas por data. Com contagem de membros ativos. */
export async function listLeagues() {
  const memberCount = sql<number>`(select count(*) from ${leagueMembers} m join ${seasons} s on s.id = m.season_id where m.league_id = "leagues"."id" and m.left_at is null and s.ended_at is null)::int`;
  return db
    .select({ league: leagues, members: memberCount })
    .from(leagues)
    .where(inArray(leagues.status, ['open', 'closed']))
    .orderBy(desc(leagues.isGlobal), desc(sql`${memberCount}`), asc(leagues.createdAt));
}

/** Inscrições ativas de um jogador, com liga, divisão e posição. */
export async function membershipsOf(playerId: number) {
  const rows = await db.query.leagueMembers.findMany({
    where: and(eq(leagueMembers.playerId, playerId), isNull(leagueMembers.leftAt)),
    with: { league: true, division: true, season: true },
  });
  const out = [];
  for (const m of rows) {
    if (m.season.endedAt) continue;
    const table = await standings(m.seasonId, m.divisionId);
    const idx = table.findIndex((r) => r.playerId === playerId);
    out.push({ ...m, position: idx + 1, total: table.length, row: table[idx] });
  }
  return out;
}

/* ───────────── Página da liga: contagens, tabela paginada, busca, cartões ───────────── */

/** Membros ativos por divisão numa temporada (divisionId → total). */
export async function divisionCounts(seasonId: number): Promise<Map<number, number>> {
  const rows = await db
    .select({ divisionId: leagueMembers.divisionId, n: sql<number>`count(*)::int` })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.seasonId, seasonId), isNull(leagueMembers.leftAt)))
    .groupBy(leagueMembers.divisionId);
  return new Map(rows.map((r) => [r.divisionId, r.n]));
}

export type RankedRow = StandingRow & { pos: number };
export type StandingsPage = { rows: RankedRow[]; total: number; page: number; pages: number; me: RankedRow | null };

/**
 * Uma página da classificação de uma divisão (página começa em 1).
 * page = null: abre na página do `playerId`, se ele estiver na divisão; senão na primeira.
 * `me` traz a linha do `playerId` (com posição), esteja ele na página ou não.
 * Fatia em memória: a tabela inteira da divisão é pequena hoje.
 */
export async function standingsPage(seasonId: number, divisionId: number, page: number | null, size = 25, playerId?: number): Promise<StandingsPage> {
  const all = (await standings(seasonId, divisionId)).map((r, i) => ({ ...r, pos: i + 1 }));
  const me = playerId != null ? all.find((r) => r.playerId === playerId) ?? null : null;
  const pages = Math.max(1, Math.ceil(all.length / size));
  const wanted = page ?? (me ? Math.ceil(me.pos / size) : 1);
  const p = Math.min(Math.max(1, Math.floor(wanted) || 1), pages);
  return { rows: all.slice((p - 1) * size, p * size), total: all.length, page: p, pages, me };
}

export type SearchRow = RankedRow & { divisionId: number };

/**
 * Busca por parte do nick (sem diferenciar maiúscula) em todas as divisões da temporada.
 * A posição é a da divisão do jogador. Ordem: divisão (sort), depois posição.
 */
export async function searchStandings(seasonId: number, q: string, limit = 500): Promise<SearchRow[]> {
  const term = q.trim().slice(0, 40);
  if (!term) return [];
  const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
  const hits = await db
    .select({ playerId: leagueMembers.playerId, divisionId: leagueMembers.divisionId, sort: divisions.sort })
    .from(leagueMembers)
    .innerJoin(players, eq(players.id, leagueMembers.playerId))
    .innerJoin(divisions, eq(divisions.id, leagueMembers.divisionId))
    .where(and(eq(leagueMembers.seasonId, seasonId), isNull(leagueMembers.leftAt), ilike(players.alias, pattern)))
    .limit(limit);
  if (hits.length === 0) return [];
  const wanted = new Set(hits.map((h) => h.playerId));
  const divOrder = new Map(hits.map((h) => [h.divisionId, h.sort]));
  const out: SearchRow[] = [];
  for (const divisionId of [...divOrder.keys()].sort((a, b) => divOrder.get(a)! - divOrder.get(b)!)) {
    const table = await standings(seasonId, divisionId);
    table.forEach((r, i) => { if (wanted.has(r.playerId)) out.push({ ...r, pos: i + 1, divisionId }); });
  }
  return out;
}

/**
 * Partidas da temporada, mais recentes primeiro, com filtro opcional por divisão e/ou jogador
 * (vencedor ou perdedor). Mesmo formato de `recentLeagueMatches`.
 */
export async function leagueMatchList(seasonId: number, opts: { divisionId?: number; playerId?: number; limit?: number } = {}) {
  const conds = [eq(leagueMatches.seasonId, seasonId)];
  if (opts.divisionId != null) conds.push(eq(leagueMatches.divisionId, opts.divisionId));
  if (opts.playerId != null) conds.push(or(eq(leagueMatches.winnerPlayerId, opts.playerId), eq(leagueMatches.loserPlayerId, opts.playerId))!);
  return db.query.leagueMatches.findMany({
    where: and(...conds),
    with: { winner: true, loser: true, match: { with: { members: true } }, division: true },
    orderBy: [desc(leagueMatches.playedAt)],
    limit: opts.limit ?? 10,
  });
}
export type LeagueMatchItem = Awaited<ReturnType<typeof leagueMatchList>>[number];

/** Última temporada encerrada da liga, com o total de membros que terminaram nela. null se nunca encerrou. */
export async function lastEndedSeason(leagueId: number) {
  const s = await db.query.seasons.findFirst({
    where: and(eq(seasons.leagueId, leagueId), isNotNull(seasons.endedAt)),
    orderBy: [desc(seasons.number)],
  });
  if (!s) return null;
  const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(leagueMembers)
    .where(and(eq(leagueMembers.seasonId, s.id), isNull(leagueMembers.leftAt)));
  return { season: s, members: c?.n ?? 0 };
}

/** Torneios ligados à liga (sem os cancelados): em andamento primeiro, depois os mais novos. */
export async function leagueTournaments(leagueId: number, limit = 3) {
  return db
    .select({ id: tournaments.id, slug: tournaments.slug, name: tournaments.name, format: tournaments.format, teamSize: tournaments.teamSize, status: tournaments.status })
    .from(tournaments)
    .where(and(eq(tournaments.leagueId, leagueId), ne(tournaments.status, 'cancelled')))
    .orderBy(sql`case when ${tournaments.status} = 'finished' then 1 else 0 end`, desc(tournaments.createdAt))
    .limit(limit);
}

/** A liga tem webhook do Discord ligado? (só o estado; a URL nunca sai do servidor) */
export async function leagueWebhookActive(leagueId: number): Promise<boolean> {
  const w = await db.query.leagueWebhooks.findFirst({ where: and(eq(leagueWebhooks.leagueId, leagueId), eq(leagueWebhooks.enabled, true)), columns: { id: true } });
  return w != null;
}

/* ── Temporadas (histórico) ── */

export type SeasonListItem = { season: Season; members: number; matches: number };

/** Temporadas da liga, da mais recente à mais antiga, com jogadores (ativos) e partidas contadas. */
export async function seasonsOf(leagueId: number): Promise<SeasonListItem[]> {
  const list = await db.query.seasons.findMany({ where: eq(seasons.leagueId, leagueId), orderBy: [desc(seasons.number)] });
  if (!list.length) return [];
  const ids = list.map((s) => s.id);
  const [mem, mat] = await Promise.all([
    db.select({ seasonId: leagueMembers.seasonId, n: sql<number>`count(*)::int` }).from(leagueMembers)
      .where(and(inArray(leagueMembers.seasonId, ids), isNull(leagueMembers.leftAt))).groupBy(leagueMembers.seasonId),
    db.select({ seasonId: leagueMatches.seasonId, n: sql<number>`count(*)::int` }).from(leagueMatches)
      .where(and(inArray(leagueMatches.seasonId, ids), eq(leagueMatches.status, 'counted'))).groupBy(leagueMatches.seasonId),
  ]);
  const m1 = new Map(mem.map((r) => [r.seasonId, r.n]));
  const m2 = new Map(mat.map((r) => [r.seasonId, r.n]));
  return list.map((season) => ({ season, members: m1.get(season.id) ?? 0, matches: m2.get(season.id) ?? 0 }));
}

export type SeasonSummary = {
  divisions: { division: Division; rows: RankedRow[] }[];
  totals: { members: number; matches: number; divisions: number };
};

/** Resumo de uma temporada: classificação completa de cada divisão da liga e totais. */
export async function seasonSummary(seasonId: number): Promise<SeasonSummary | null> {
  const season = await db.query.seasons.findFirst({ where: eq(seasons.id, seasonId) });
  if (!season) return null;
  const divs = await db.query.divisions.findMany({ where: eq(divisions.leagueId, season.leagueId), orderBy: [asc(divisions.sort)] });
  const lists = await Promise.all(divs.map(async (division) => ({
    division,
    rows: (await standings(seasonId, division.id)).map((r, i): RankedRow => ({ ...r, pos: i + 1 })),
  })));
  const [m] = await db.select({ n: sql<number>`count(*)::int` }).from(leagueMatches)
    .where(and(eq(leagueMatches.seasonId, seasonId), eq(leagueMatches.status, 'counted')));
  return {
    divisions: lists,
    totals: { members: lists.reduce((n, d) => n + d.rows.length, 0), matches: m?.n ?? 0, divisions: divs.length },
  };
}

/** Campeão (1º) de cada divisão com membros numa temporada: divisionId → alias. Usado na lista de temporadas. */
export async function seasonChampions(seasonId: number): Promise<Map<number, string>> {
  const s = await seasonSummary(seasonId);
  const out = new Map<number, string>();
  for (const d of s?.divisions ?? []) if (d.rows[0]) out.set(d.division.id, d.rows[0].alias);
  return out;
}
