/**
 * Badges de comunidade (perfil do jogador e página "Quem ajuda").
 *
 * - supporter, code, translator: gravados à mão em `player_badges` (script apps/worker/src/tools/grant-badge.ts).
 * - organizer: computado na hora, nunca gravado como concessão. Ganha quem tem a conta (players.claimedByUserId)
 *   dona de uma liga não-global com 10+ membros ativos na temporada aberta, ou dona de um torneio `finished`.
 *   Uma linha `organizer` em `player_badges` só guarda a preferência de visibilidade (visible = false esconde).
 *
 * Textos (rótulo, como ganhar, título do tooltip) ficam nas mensagens do web (namespace `badges`), não aqui.
 */
import { db, leagueMembers, leagues, playerBadges, players, seasons, tournaments } from '@aoe2/db';
import { and, eq, gte, ilike, inArray, isNotNull, isNull, sql } from 'drizzle-orm';

export const BADGE_KEYS = ['supporter', 'code', 'translator', 'organizer'] as const;
export type BadgeKey = (typeof BADGE_KEYS)[number];
export const GRANTABLE_BADGES = ['supporter', 'code', 'translator'] as const;
export type GrantableBadge = (typeof GRANTABLE_BADGES)[number];

/** Membros ativos mínimos na temporada aberta pra liga valer o badge de organizador. */
export const ORGANIZER_MIN_MEMBERS = 10;

/** Cor e ícone (path Lucide, viewBox 24) de cada badge. */
export const BADGES: Record<BadgeKey, { color: string; icon: string }> = {
  supporter: { color: '#a6342e', icon: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z' },
  code: { color: '#3b6ea8', icon: 'm16 18 6-6-6-6 M8 6l-6 6 6 6' },
  translator: { color: '#4f7a3a', icon: 'm5 8 6 6 M4 14l6-6 2-3 M2 5h12 M7 2h1 M22 22l-5-10-5 10 M14 18h6' },
  organizer: { color: '#d4af5a', icon: 'M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.33 2q2 0 3.67-1.33a1 1 0 0 1 1.6.8v10.06a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a8 8 0 0 0-4 1' },
};

export function isBadgeKey(v: unknown): v is BadgeKey {
  return typeof v === 'string' && (BADGE_KEYS as readonly string[]).includes(v);
}
export function isGrantableBadge(v: unknown): v is GrantableBadge {
  return typeof v === 'string' && (GRANTABLE_BADGES as readonly string[]).includes(v);
}

const sortKeys = (keys: Iterable<BadgeKey>) => [...new Set(keys)].sort((a, b) => BADGE_KEYS.indexOf(a) - BADGE_KEYS.indexOf(b));

/** Contas (users.id) que hoje valem o badge de organizador. */
async function organizerUserIds(onlyUserId?: number): Promise<Set<number>> {
  const leagueOwners = await db
    .select({ uid: leagues.ownerUserId })
    .from(leagues)
    .innerJoin(seasons, and(eq(seasons.leagueId, leagues.id), isNull(seasons.endedAt)))
    .innerJoin(leagueMembers, and(eq(leagueMembers.seasonId, seasons.id), isNull(leagueMembers.leftAt)))
    .where(and(eq(leagues.isGlobal, false), onlyUserId != null ? eq(leagues.ownerUserId, onlyUserId) : isNotNull(leagues.ownerUserId)))
    .groupBy(leagues.id, leagues.ownerUserId)
    .having(gte(sql<number>`count(*)`, ORGANIZER_MIN_MEMBERS));
  const tournamentOwners = await db
    .selectDistinct({ uid: tournaments.ownerUserId })
    .from(tournaments)
    .where(and(eq(tournaments.status, 'finished'), onlyUserId != null ? eq(tournaments.ownerUserId, onlyUserId) : isNotNull(tournaments.ownerUserId)));
  const out = new Set<number>();
  for (const r of [...leagueOwners, ...tournamentOwners]) if (r.uid != null) out.add(r.uid);
  return out;
}

/** Jogadores (players.id) com organizer visível: conta qualificada e sem linha `organizer` escondida. */
async function organizerPlayerIds(): Promise<Set<number>> {
  const uids = [...(await organizerUserIds())];
  if (uids.length === 0) return new Set();
  const rows = await db
    .select({ id: players.id })
    .from(players)
    .leftJoin(playerBadges, and(eq(playerBadges.playerId, players.id), eq(playerBadges.badge, 'organizer')))
    .where(and(inArray(players.claimedByUserId, uids), sql`coalesce(${playerBadges.visible}, true)`));
  return new Set(rows.map((r) => r.id));
}

/** Badges visíveis de um jogador, na ordem de BADGE_KEYS. */
export async function badgesOf(playerId: number): Promise<BadgeKey[]> {
  const rows = await db.query.playerBadges.findMany({ where: eq(playerBadges.playerId, playerId) });
  const keys: BadgeKey[] = [];
  for (const r of rows) if (r.visible && isBadgeKey(r.badge) && r.badge !== 'organizer') keys.push(r.badge);
  const organizerPref = rows.find((r) => r.badge === 'organizer');
  if (!organizerPref || organizerPref.visible) {
    const player = await db.query.players.findFirst({ where: eq(players.id, playerId), columns: { claimedByUserId: true } });
    if (player?.claimedByUserId != null && (await organizerUserIds(player.claimedByUserId)).size > 0) keys.push('organizer');
  }
  return sortKeys(keys);
}

/** Concede (ou atualiza a nota de) um badge manual. Mantém a visibilidade escolhida antes. */
export async function grantBadge(playerId: number, badge: GrantableBadge, note?: string | null) {
  if (!isGrantableBadge(badge)) throw new Error(`badge não concedível à mão: ${badge}`);
  const [row] = await db
    .insert(playerBadges)
    .values({ playerId, badge, note: note ?? null })
    .onConflictDoUpdate({ target: [playerBadges.playerId, playerBadges.badge], set: note != null ? { note } : { badge } })
    .returning();
  return row!;
}

/** Remove um badge gravado. true se havia linha. */
export async function revokeBadge(playerId: number, badge: BadgeKey): Promise<boolean> {
  const rows = await db.delete(playerBadges).where(and(eq(playerBadges.playerId, playerId), eq(playerBadges.badge, badge))).returning({ id: playerBadges.id });
  return rows.length > 0;
}

/**
 * Mostra ou esconde um badge. Pros manuais só altera linha existente (não concede).
 * Pro organizer grava a preferência numa linha própria (o badge segue computado).
 * true se a preferência ficou gravada.
 */
export async function setBadgeVisibility(playerId: number, badge: BadgeKey, visible: boolean): Promise<boolean> {
  if (badge === 'organizer') {
    await db
      .insert(playerBadges)
      .values({ playerId, badge, visible, note: 'preferência de visibilidade (badge computado)' })
      .onConflictDoUpdate({ target: [playerBadges.playerId, playerBadges.badge], set: { visible } });
    return true;
  }
  const rows = await db
    .update(playerBadges)
    .set({ visible })
    .where(and(eq(playerBadges.playerId, playerId), eq(playerBadges.badge, badge)))
    .returning({ id: playerBadges.id });
  return rows.length > 0;
}

/** Mapa playerId → badges visíveis (gravados + organizer computado). */
async function visibleHolders(): Promise<Map<number, BadgeKey[]>> {
  const rows = await db
    .select({ playerId: playerBadges.playerId, badge: playerBadges.badge })
    .from(playerBadges)
    .where(and(eq(playerBadges.visible, true), inArray(playerBadges.badge, [...GRANTABLE_BADGES])));
  const map = new Map<number, BadgeKey[]>();
  const add = (id: number, k: BadgeKey) => map.set(id, [...(map.get(id) ?? []), k]);
  for (const r of rows) if (isBadgeKey(r.badge)) add(r.playerId, r.badge);
  for (const id of await organizerPlayerIds()) add(id, 'organizer');
  for (const [id, keys] of map) map.set(id, sortKeys(keys));
  return map;
}

export type SupporterRow = { playerId: number; profileId: number; alias: string; flag: string | null; badges: BadgeKey[] };

/**
 * Jogadores com pelo menos um badge visível, por alias (sem diferenciar maiúscula).
 * badge filtra por um badge; q busca parte do nick. Monta a lista em memória: a quantidade
 * de quem tem badge é pequena (doadores, contribuidores, donos de liga/torneio).
 */
export async function supportersList(opts: { badge?: BadgeKey | null; q?: string | null; limit: number; offset?: number }): Promise<{ rows: SupporterRow[]; total: number }> {
  const holders = await visibleHolders();
  let ids = [...holders.keys()];
  if (opts.badge) ids = ids.filter((id) => holders.get(id)!.includes(opts.badge!));
  if (ids.length === 0) return { rows: [], total: 0 };
  const term = (opts.q ?? '').trim().slice(0, 40);
  const where = term
    ? and(inArray(players.id, ids), ilike(players.alias, `%${term.replace(/[\\%_]/g, '\\$&')}%`))
    : inArray(players.id, ids);
  const found = await db
    .select({ id: players.id, profileId: players.profileId, alias: players.alias, country: players.country })
    .from(players)
    .where(where)
    .orderBy(sql`lower(${players.alias})`, players.id);
  const offset = Math.max(0, opts.offset ?? 0);
  const rows = found.slice(offset, offset + Math.max(0, opts.limit)).map((p) => ({
    playerId: p.id, profileId: p.profileId, alias: p.alias, flag: p.country, badges: holders.get(p.id)!,
  }));
  return { rows, total: found.length };
}

/** Quantas pessoas mostram cada badge, mais quantos apoiadores preferiram esconder o seu. */
export async function badgeCounts(): Promise<Record<BadgeKey, number> & { hiddenSupporters: number }> {
  const holders = await visibleHolders();
  const counts = { supporter: 0, code: 0, translator: 0, organizer: 0 } satisfies Record<BadgeKey, number>;
  for (const keys of holders.values()) for (const k of keys) counts[k]++;
  const [hidden] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(playerBadges)
    .where(and(eq(playerBadges.badge, 'supporter'), eq(playerBadges.visible, false)));
  return { ...counts, hiddenSupporters: hidden?.n ?? 0 };
}
