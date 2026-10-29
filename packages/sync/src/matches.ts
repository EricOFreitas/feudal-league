import { BATCH_MATCH_HISTORY, getRecentMatchHistory } from '@aoe2/aoe-api';
import { db, matches, matchMembers } from '@aoe2/db';
import { desc, eq, inArray, sql } from 'drizzle-orm';

/** Baixa o histórico recente de vários jogadores e grava partidas + participantes (idempotente). */
export async function syncMatchHistory(profileIds: number[]): Promise<{ matches: number }> {
  let total = 0;
  for (let i = 0; i < profileIds.length; i += BATCH_MATCH_HISTORY) {
    const batch = profileIds.slice(i, i + BATCH_MATCH_HISTORY);
    const { matches: apiMatches, profiles } = await getRecentMatchHistory(batch);
    const aliasByProfile = new Map(profiles.map((p) => [p.profile_id, p.alias]));
    // só partidas finalizadas
    const done = apiMatches.filter((m) => m.completiontime > 0);
    if (done.length === 0) continue;

    const existing = new Set(
      (await db.select({ id: matches.id }).from(matches).where(inArray(matches.id, done.map((m) => m.id)))).map((r) => r.id),
    );
    const fresh = done.filter((m) => !existing.has(m.id));
    if (fresh.length === 0) continue;

    for (let j = 0; j < fresh.length; j += 200) {
      const chunk = fresh.slice(j, j + 200);
      await db.insert(matches).values(chunk.map((m) => ({
        id: m.id, matchtypeId: m.matchtype_id, mapName: m.mapname, description: m.description || null, maxPlayers: m.maxplayers,
        startedAt: new Date(m.startgametime * 1000), completedAt: new Date(m.completiontime * 1000),
      }))).onConflictDoNothing();
      const members = chunk.flatMap((m) => m.matchhistorymember.map((mm) => ({
        matchId: m.id, profileId: mm.profile_id, alias: aliasByProfile.get(mm.profile_id) ?? null, team: mm.teamid,
        civId: mm.civilization_id, outcome: mm.outcome, oldRating: mm.oldrating, newRating: mm.newrating,
      })));
      if (members.length) await db.insert(matchMembers).values(members).onConflictDoNothing();
    }
    total += fresh.length;
  }
  return { matches: total };
}

/** Últimas N partidas de um jogador, com todos os participantes. */
export async function recentMatchesOf(profileId: number, limit = 20) {
  const ids = await db
    .select({ id: matchMembers.matchId })
    .from(matchMembers)
    .innerJoin(matches, eq(matches.id, matchMembers.matchId))
    .where(eq(matchMembers.profileId, profileId))
    .orderBy(desc(matches.completedAt))
    .limit(limit);
  if (ids.length === 0) return [];
  const rows = await db.query.matches.findMany({
    where: inArray(matches.id, ids.map((r) => r.id)),
    with: { members: true },
    orderBy: [desc(matches.completedAt)],
  });
  return rows;
}

export async function matchCountOf(profileId: number): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(matchMembers).where(eq(matchMembers.profileId, profileId));
  return r?.n ?? 0;
}
