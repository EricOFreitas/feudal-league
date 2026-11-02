/**
 * Liga mensal (só a Global): a temporada vai do dia 1º ao último dia do mês em Brasília.
 * Na virada, a próxima temporada abre com os membros recolocados. O pódio do mês que acabou só é apurado
 * PODIUM_GRACE_MS depois: até lá a detecção continua trazendo partidas jogadas antes da virada, porque
 * parte dos membros sincroniza a cada 6 h. Medalha exige PODIUM_MIN_GAMES partidas contadas no mês.
 */
import { db, divisions, leagueMatches, leagues, playerMedals, players, seasons, type Division, type Player, type PlayerMedal, type Season } from '@aoe2/db';
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { GLOBAL_SLUG, PODIUM_MIN_GAMES, activeSeason, monthBoundaryAfter, standings, startNewSeason } from './leagues';

const PODIUM_GRACE_MS = 12 * 60 * 60 * 1000;

/** Vira o mês da Liga Global, se já passou da hora. Devolve 1 se abriu temporada nova. */
export async function rollMonthlySeasons(now = new Date()): Promise<number> {
  const global = await db.query.leagues.findFirst({ where: eq(leagues.slug, GLOBAL_SLUG) });
  if (!global) return 0;
  const current = await activeSeason(global.id);
  if (!current) return 0;
  if (!current.endsAt) {
    await db.update(seasons).set({ endsAt: monthBoundaryAfter(current.startedAt) }).where(eq(seasons.id, current.id));
    return 0;
  }
  if (current.endsAt > now) return 0;
  await startNewSeason(global.id, { at: current.endsAt });
  return 1;
}

/** Apura o pódio dos meses encerrados: até 3 medalhas por divisão. Devolve quantas gravou. Idempotente. */
export async function awardMonthlyPodiums(now = new Date()): Promise<number> {
  const due = await db.query.seasons.findMany({
    where: and(isNotNull(seasons.endsAt), isNotNull(seasons.endedAt), isNull(seasons.podiumAt), lt(seasons.endedAt, new Date(now.getTime() - PODIUM_GRACE_MS))),
  });
  let awarded = 0;
  for (const season of due) {
    const divs = await db.query.divisions.findMany({ where: eq(divisions.leagueId, season.leagueId) });
    for (const d of divs) {
      const top = (await standings(season.id, d.id)).filter((r) => r.wins + r.losses >= PODIUM_MIN_GAMES).slice(0, 3);
      if (top.length === 0) continue;
      const rows = await db.insert(playerMedals).values(top.map((r, i) => ({
        playerId: r.playerId, seasonId: season.id, divisionId: d.id, position: i + 1, points: r.points, wins: r.wins, losses: r.losses,
      }))).onConflictDoNothing().returning({ id: playerMedals.id });
      awarded += rows.length;
    }
    await db.update(seasons).set({ podiumAt: now }).where(eq(seasons.id, season.id));
  }
  return awarded;
}

export type MedalItem = PlayerMedal & { season: Season; division: Division };

/** Medalhas de um jogador, da mais recente à mais antiga. */
export async function medalsOf(playerId: number): Promise<MedalItem[]> {
  return db.query.playerMedals.findMany({
    where: eq(playerMedals.playerId, playerId),
    with: { season: true, division: true },
    orderBy: [desc(playerMedals.awardedAt), asc(playerMedals.position)],
  });
}

/** Melhor medalha: a de melhor posição; no empate, a mais recente. */
export function bestMedal(list: MedalItem[]): MedalItem | null {
  return [...list].sort((a, b) => a.position - b.position || b.awardedAt.getTime() - a.awardedAt.getTime())[0] ?? null;
}

/** Melhor medalha de vários jogadores, por profile_id (página da partida). */
export async function bestMedalsByProfile(profileIds: number[]): Promise<Map<number, MedalItem>> {
  if (profileIds.length === 0) return new Map();
  const rows = await db.query.players.findMany({
    where: inArray(players.profileId, profileIds),
    columns: { profileId: true },
    with: { medals: { with: { season: true, division: true } } },
  });
  const out = new Map<number, MedalItem>();
  for (const p of rows) {
    const best = bestMedal(p.medals);
    if (best) out.set(p.profileId, best);
  }
  return out;
}

export type PodiumRow = { position: number; points: number; player: Pick<Player, 'profileId' | 'alias' | 'country'> };

/** Pódio do último mês apurado da Global, por divisão (com os participantes de cada uma). null se ainda não houve. */
export async function lastPodium(): Promise<{ season: Season; divisions: { division: Division; members: number; rows: PodiumRow[] }[] } | null> {
  const global = await db.query.leagues.findFirst({ where: eq(leagues.slug, GLOBAL_SLUG), columns: { id: true } });
  if (!global) return null;
  const season = await db.query.seasons.findFirst({ where: and(eq(seasons.leagueId, global.id), isNotNull(seasons.podiumAt)), orderBy: [desc(seasons.number)] });
  if (!season) return null;
  const divs = await db.query.divisions.findMany({ where: eq(divisions.leagueId, global.id), orderBy: [asc(divisions.sort)] });
  const medals = await db.query.playerMedals.findMany({
    where: eq(playerMedals.seasonId, season.id),
    with: { player: { columns: { profileId: true, alias: true, country: true } } },
    orderBy: [asc(playerMedals.position)],
  });
  const counts = await db.execute<{ division_id: number; n: number }>(sql`
    select division_id, count(*)::int as n from league_members where season_id = ${season.id} and left_at is null group by division_id
  `);
  const byDivision = new Map([...counts].map((c) => [Number(c.division_id), Number(c.n)]));
  return {
    season,
    divisions: divs.map((division) => ({
      division,
      members: byDivision.get(division.id) ?? 0,
      rows: medals.filter((m) => m.divisionId === division.id).map((m) => ({ position: m.position, points: m.points, player: m.player })),
    })).filter((d) => d.rows.length > 0),
  };
}

/** Partidas contadas no mês por jogador: o que falta pra entrar no pódio ("Por que contou?"). */
export async function monthGames(seasonId: number, playerIds: number[]): Promise<Map<number, number>> {
  if (playerIds.length === 0) return new Map();
  const rows = await db.select({ winner: leagueMatches.winnerPlayerId, loser: leagueMatches.loserPlayerId }).from(leagueMatches)
    .where(and(eq(leagueMatches.seasonId, seasonId), eq(leagueMatches.status, 'counted'), or(inArray(leagueMatches.winnerPlayerId, playerIds), inArray(leagueMatches.loserPlayerId, playerIds))));
  const out = new Map<number, number>();
  for (const r of rows) {
    out.set(r.winner, (out.get(r.winner) ?? 0) + 1);
    out.set(r.loser, (out.get(r.loser) ?? 0) + 1);
  }
  return out;
}
