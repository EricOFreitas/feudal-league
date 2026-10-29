import {
  BATCH_PERSONAL_STAT, getPersonalStatByProfileIds, getPersonalStatByNames, joinStats, steamIdFromName,
  type LeaderboardStat, type Member,
} from '@aoe2/aoe-api';
import { db, players, playerRatings, ratingSnapshots } from '@aoe2/db';
import { and, eq, inArray } from 'drizzle-orm';

const tsOrNull = (unix: number) => (unix > 0 ? new Date(unix * 1000) : null);

/** Grava member + stats de um jogador. Cria o registro em players se não existir. Devolve o id interno. */
export async function upsertPlayerFromApi(member: Member, stats: LeaderboardStat[], extra?: { addedByIpHash?: string }) {
  const steamId64 = steamIdFromName(member.name);
  const [row] = await db
    .insert(players)
    .values({
      profileId: member.profile_id,
      steamId64,
      alias: member.alias,
      country: member.country || null,
      clan: member.clanlist_name || null,
      addedByIpHash: extra?.addedByIpHash,
      lastSyncedAt: new Date(),
      lastSyncError: null,
    })
    .onConflictDoUpdate({
      target: players.profileId,
      set: { steamId64, alias: member.alias, country: member.country || null, clan: member.clanlist_name || null, lastSyncedAt: new Date(), lastSyncError: null },
    })
    .returning({ id: players.id });
  const playerId = row!.id;

  const current = await db.select().from(playerRatings).where(eq(playerRatings.playerId, playerId));
  const currentByLb = new Map(current.map((r) => [r.leaderboardId, r]));

  for (const s of stats) {
    const prev = currentByLb.get(s.leaderboard_id);
    const changed = !prev || prev.rating !== s.rating || prev.wins !== s.wins || prev.losses !== s.losses;
    await db
      .insert(playerRatings)
      .values({
        playerId, leaderboardId: s.leaderboard_id, rating: s.rating, rank: s.rank, rankTotal: s.ranktotal,
        wins: s.wins, losses: s.losses, streak: s.streak, drops: s.drops,
        highestRating: s.highestrating, highestRank: s.highestrank, lastMatchAt: tsOrNull(s.lastmatchdate), updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [playerRatings.playerId, playerRatings.leaderboardId],
        set: {
          rating: s.rating, rank: s.rank, rankTotal: s.ranktotal, wins: s.wins, losses: s.losses, streak: s.streak, drops: s.drops,
          highestRating: s.highestrating, highestRank: s.highestrank, lastMatchAt: tsOrNull(s.lastmatchdate), updatedAt: new Date(),
        },
      });
    if (changed) {
      await db.insert(ratingSnapshots).values({ playerId, leaderboardId: s.leaderboard_id, rating: s.rating, rank: s.rank, wins: s.wins, losses: s.losses });
    }
  }
  return playerId;
}

/** Sincroniza rating de vários profile_ids (lotes de 100). Devolve quantos vieram da API. */
export async function syncRatingsByProfileIds(profileIds: number[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < profileIds.length; i += BATCH_PERSONAL_STAT) {
    const batch = profileIds.slice(i, i + BATCH_PERSONAL_STAT);
    try {
      const joined = joinStats(await getPersonalStatByProfileIds(batch));
      for (const { member, stats } of joined.values()) { await upsertPlayerFromApi(member, stats); n++; }
      const missing = batch.filter((id) => !joined.has(id));
      if (missing.length) await db.update(players).set({ lastSyncError: 'não veio na resposta da API' }).where(inArray(players.profileId, missing));
    } catch (e) {
      await db.update(players).set({ lastSyncError: (e as Error).message.slice(0, 500) }).where(inArray(players.profileId, batch));
      throw e;
    }
  }
  return n;
}

/** Busca na API por SteamID64 e grava. null = não existe perfil de AoE2 pra essa Steam. */
export async function importPlayerBySteamId(steamId64: string, extra?: { addedByIpHash?: string }) {
  const joined = joinStats(await getPersonalStatByNames([`/steam/${steamId64}`]));
  const first = [...joined.values()][0];
  if (!first) return null;
  const id = await upsertPlayerFromApi(first.member, first.stats, extra);
  return { id, profileId: first.member.profile_id };
}

export async function importPlayerByProfileId(profileId: number, extra?: { addedByIpHash?: string }) {
  const joined = joinStats(await getPersonalStatByProfileIds([profileId]));
  const first = joined.get(profileId);
  if (!first) return null;
  const id = await upsertPlayerFromApi(first.member, first.stats, extra);
  return { id, profileId };
}

export async function findPlayerByProfileId(profileId: number) {
  return db.query.players.findFirst({ where: eq(players.profileId, profileId), with: { ratings: true } });
}

export async function findPlayerBySteamId(steamId64: string) {
  return db.query.players.findFirst({ where: and(eq(players.steamId64, steamId64)), with: { ratings: true } });
}
