import { LEADERBOARDS, RM_1V1 } from '@aoe2/aoe-api';
import { db, divisions, leagueMembers, leagues, matches, matchMembers, playerFollows, playerRatings, players, seasons } from '@aoe2/db';
import { and, count, desc, eq, gt, inArray, isNull, max, sql } from 'drizzle-orm';

/** Quantos jogadores um usuário pode seguir. Cada seguido sincroniza a cada 1 h no worker. */
export const FOLLOW_MAX = 50;

export async function isFollowing(userId: number, playerId: number): Promise<boolean> {
  const row = await db.query.playerFollows.findFirst({ where: and(eq(playerFollows.userId, userId), eq(playerFollows.playerId, playerId)) });
  return row != null;
}

export async function followCount(userId: number): Promise<number> {
  const [r] = await db.select({ n: count() }).from(playerFollows).where(eq(playerFollows.userId, userId));
  return r?.n ?? 0;
}

export async function follow(userId: number, playerId: number): Promise<{ ok: true } | { ok: false; reason: 'limit' }> {
  if (await isFollowing(userId, playerId)) return { ok: true };
  if ((await followCount(userId)) >= FOLLOW_MAX) return { ok: false, reason: 'limit' };
  await db.insert(playerFollows).values({ userId, playerId }).onConflictDoNothing();
  return { ok: true };
}

export async function unfollow(userId: number, playerId: number): Promise<void> {
  await db.delete(playerFollows).where(and(eq(playerFollows.userId, userId), eq(playerFollows.playerId, playerId)));
}

export type FollowedRow = {
  playerId: number; profileId: number; alias: string; country: string | null; clan: string | null;
  /** Rating atual na RM 1v1 (null = nunca jogou ranqueada 1v1). */
  rating: number | null;
  /** Soma dos pontos ganhos e perdidos na RM 1v1 nos últimos 7 dias (null = nenhuma partida no período). */
  weekDelta: number | null;
  /** Divisão na temporada aberta da Liga Global (null = fora da Global). */
  division: { name: string | null; nameKey: string | null } | null;
  lastMatchAt: Date | null;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Quem o usuário segue, com rating, variação da semana, divisão na Global e última partida. Ordem: partida mais recente primeiro. */
export async function followingOf(userId: number): Promise<FollowedRow[]> {
  const base = await db
    .select({ playerId: players.id, profileId: players.profileId, alias: players.alias, country: players.country, clan: players.clan, rating: playerRatings.rating })
    .from(playerFollows)
    .innerJoin(players, eq(players.id, playerFollows.playerId))
    .leftJoin(playerRatings, and(eq(playerRatings.playerId, players.id), eq(playerRatings.leaderboardId, RM_1V1)))
    .where(eq(playerFollows.userId, userId));
  if (base.length === 0) return [];
  const profileIds = base.map((r) => r.profileId);
  const playerIds = base.map((r) => r.playerId);

  const last = await db
    .select({ profileId: matchMembers.profileId, at: max(matches.completedAt) })
    .from(matchMembers)
    .innerJoin(matches, eq(matches.id, matchMembers.matchId))
    .where(inArray(matchMembers.profileId, profileIds))
    .groupBy(matchMembers.profileId);
  const lastBy = new Map(last.map((r) => [r.profileId, r.at]));

  const week = await db
    .select({ profileId: matchMembers.profileId, delta: sql<number>`sum(${matchMembers.newRating} - ${matchMembers.oldRating})::int` })
    .from(matchMembers)
    .innerJoin(matches, eq(matches.id, matchMembers.matchId))
    .where(and(
      inArray(matchMembers.profileId, profileIds),
      inArray(matches.matchtypeId, [...LEADERBOARDS[RM_1V1].matchTypes]),
      gt(matches.completedAt, new Date(Date.now() - WEEK_MS)),
    ))
    .groupBy(matchMembers.profileId);
  const weekBy = new Map(week.map((r) => [r.profileId, r.delta]));

  const divs = await db
    .select({ playerId: leagueMembers.playerId, name: divisions.name, nameKey: divisions.nameKey })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
    .innerJoin(seasons, eq(seasons.id, leagueMembers.seasonId))
    .innerJoin(divisions, eq(divisions.id, leagueMembers.divisionId))
    .where(and(inArray(leagueMembers.playerId, playerIds), eq(leagues.isGlobal, true), isNull(seasons.endedAt), isNull(leagueMembers.leftAt)));
  const divBy = new Map(divs.map((r) => [r.playerId, { name: r.name, nameKey: r.nameKey }]));

  return base
    .map((r) => ({
      ...r,
      weekDelta: weekBy.get(r.profileId) ?? null,
      division: divBy.get(r.playerId) ?? null,
      lastMatchAt: lastBy.get(r.profileId) ?? null,
    }))
    .sort((a, b) => (b.lastMatchAt?.getTime() ?? 0) - (a.lastMatchAt?.getTime() ?? 0));
}

/**
 * Últimas partidas de quem o usuário segue. `subject` = profile_id do seguido do ponto de vista de quem a linha é contada;
 * se dois seguidos jogaram entre si, a partida aparece uma vez, pelo lado do vencedor.
 */
export async function followedFeed(userId: number, limit = 20) {
  const followed = await db
    .select({ profileId: players.profileId })
    .from(playerFollows)
    .innerJoin(players, eq(players.id, playerFollows.playerId))
    .where(eq(playerFollows.userId, userId));
  if (followed.length === 0) return [];
  const ids = new Set(followed.map((r) => r.profileId));

  const recent = await db
    .selectDistinct({ id: matches.id, completedAt: matches.completedAt })
    .from(matchMembers)
    .innerJoin(matches, eq(matches.id, matchMembers.matchId))
    .where(inArray(matchMembers.profileId, [...ids]))
    .orderBy(desc(matches.completedAt))
    .limit(limit);
  if (recent.length === 0) return [];

  const rows = await db.query.matches.findMany({
    where: inArray(matches.id, recent.map((r) => r.id)),
    with: { members: true },
    orderBy: [desc(matches.completedAt)],
  });
  return rows.map((m) => {
    const mine = m.members.filter((x) => ids.has(x.profileId));
    const subject = (mine.find((x) => x.outcome === 1) ?? mine[0])!.profileId;
    return { match: m, subject };
  });
}
