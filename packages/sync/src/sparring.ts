/**
 * Treino, etapa T5 (docs/TREINO.md): "Quero treinar" e "Topo mentorar" por divisão.
 *
 * - O jogador fica disponível por SPARRING_HOURS na liga em que é membro. Mentor aparece pra divisão abaixo da dele.
 * - O site não cria partida: um dos dois abre o lobby no jogo. O worker lê a lista pública de lobbies a cada
 *   30 s (só enquanto alguém está disponível) e guarda os dos anfitriões disponíveis; a página mostra o botão
 *   "Entrar no lobby", que abre o jogo pelo link aoe2de://0/<id>.
 * - Treino conta na liga como qualquer partida (decisão do Eric, 03/11/2026).
 */
import { findOpenLobbies } from '@aoe2/aoe-api';
import { db, divisions, leagueMembers, openLobbies, players, seasons, sparringAvailability } from '@aoe2/db';
import { and, asc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import { divisionAbove } from './metrics';

export const SPARRING_KINDS = ['train', 'mentor'] as const;
export type SparringKind = (typeof SPARRING_KINDS)[number];
export const SPARRING_HOURS = 2;
export const SPARRING_NOTE_MAX = 80;

export type SparringLobby = { id: number; description: string; passwordProtected: boolean; players: number; maxPlayers: number };
export type SparringEntry = {
  playerId: number; profileId: number; alias: string; country: string | null; steamId64: string | null;
  kind: SparringKind; note: string | null; expiresAt: Date; lobby: SparringLobby | null;
};
export type SetSparringResult = { ok: true; divisionId: number } | { ok: false; reason: 'not_member' | 'no_division_below' };

/** Inscrição ativa do jogador na temporada aberta da liga. */
async function activeMembership(playerId: number, leagueId: number) {
  const rows = await db
    .select({ divisionId: leagueMembers.divisionId })
    .from(leagueMembers)
    .innerJoin(seasons, eq(seasons.id, leagueMembers.seasonId))
    .where(and(eq(leagueMembers.playerId, playerId), eq(leagueMembers.leagueId, leagueId), isNull(leagueMembers.leftAt), isNull(seasons.endedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function setSparring(playerId: number, leagueId: number, kind: SparringKind, note: string | null): Promise<SetSparringResult> {
  const m = await activeMembership(playerId, leagueId);
  if (!m) return { ok: false, reason: 'not_member' };
  if (kind === 'mentor') {
    const d = await db.query.divisions.findFirst({ where: eq(divisions.id, m.divisionId) });
    const below = d ? await db.query.divisions.findFirst({ where: and(eq(divisions.leagueId, leagueId), eq(divisions.sort, d.sort - 1)) }) : null;
    if (!below) return { ok: false, reason: 'no_division_below' };
  }
  const clean = note?.trim().slice(0, SPARRING_NOTE_MAX) || null;
  const expiresAt = new Date(Date.now() + SPARRING_HOURS * 60 * 60 * 1000);
  await db
    .insert(sparringAvailability)
    .values({ playerId, leagueId, divisionId: m.divisionId, kind, note: clean, expiresAt })
    .onConflictDoUpdate({ target: [sparringAvailability.playerId, sparringAvailability.leagueId], set: { divisionId: m.divisionId, kind, note: clean, expiresAt, createdAt: new Date(), notifiedAt: null } });
  return { ok: true, divisionId: m.divisionId };
}

export async function clearSparring(playerId: number, leagueId: number) {
  await db.delete(sparringAvailability).where(and(eq(sparringAvailability.playerId, playerId), eq(sparringAvailability.leagueId, leagueId)));
}

export async function mySparring(playerId: number, leagueId: number) {
  return (await db.query.sparringAvailability.findFirst({
    where: and(eq(sparringAvailability.playerId, playerId), eq(sparringAvailability.leagueId, leagueId), gt(sparringAvailability.expiresAt, new Date())),
  })) ?? null;
}

async function entries(leagueId: number, divisionId: number, kind: SparringKind): Promise<SparringEntry[]> {
  const rows = await db
    .select({
      playerId: players.id, profileId: players.profileId, alias: players.alias, country: players.country, steamId64: players.steamId64,
      note: sparringAvailability.note, expiresAt: sparringAvailability.expiresAt,
    })
    .from(sparringAvailability)
    .innerJoin(players, eq(players.id, sparringAvailability.playerId))
    .where(and(eq(sparringAvailability.leagueId, leagueId), eq(sparringAvailability.divisionId, divisionId), eq(sparringAvailability.kind, kind), gt(sparringAvailability.expiresAt, new Date())))
    .orderBy(asc(sparringAvailability.createdAt));
  if (rows.length === 0) return [];
  const lobbies = await db.select().from(openLobbies).where(inArray(openLobbies.hostProfileId, rows.map((r) => r.profileId)));
  const byHost = new Map(lobbies.map((l) => [l.hostProfileId, l]));
  return rows.map((r) => {
    const l = byHost.get(r.profileId);
    return { ...r, kind, lobby: l ? { id: l.id, description: l.description ?? '', passwordProtected: l.passwordProtected, players: l.players, maxPlayers: l.maxPlayers } : null };
  });
}

/** Quem está disponível pra divisão: treinadores da própria divisão e mentores da divisão de cima. */
export async function sparringFor(leagueId: number, divisionId: number): Promise<{ trainers: SparringEntry[]; mentors: SparringEntry[]; above: { id: number; name: string | null; nameKey: string | null } | null }> {
  const above = await divisionAbove(divisionId);
  const [trainers, mentors] = await Promise.all([entries(leagueId, divisionId, 'train'), above ? entries(leagueId, above.id, 'mentor') : Promise.resolve([])]);
  return { trainers, mentors, above: above ? { id: above.id, name: above.name, nameKey: above.nameKey } : null };
}

/* ───────────────────────── worker ───────────────────────── */

/**
 * Refaz open_lobbies com os lobbies abertos pelos jogadores disponíveis. Sem ninguém disponível, não chama a
 * API (e esvazia a tabela). Devolve quantos lobbies ficaram guardados.
 */
export async function syncOpenLobbies(): Promise<number> {
  const hosts = await db
    .select({ profileId: players.profileId })
    .from(sparringAvailability)
    .innerJoin(players, eq(players.id, sparringAvailability.playerId))
    .where(gt(sparringAvailability.expiresAt, new Date()));
  if (hosts.length === 0) {
    await db.delete(openLobbies);
    return 0;
  }
  const want = new Set(hosts.map((h) => h.profileId));
  const mine = (await findOpenLobbies()).filter((l) => want.has(l.hostProfileId));
  await db.transaction(async (tx) => {
    await tx.delete(openLobbies);
    if (mine.length) {
      await tx.insert(openLobbies).values(mine.map((l) => ({
        id: l.id, hostProfileId: l.hostProfileId, description: l.description.slice(0, 120), passwordProtected: l.passwordProtected, players: l.players, maxPlayers: l.maxPlayers, seenAt: new Date(),
      }))).onConflictDoNothing();
    }
  });
  return mine.length;
}

/** Apaga disponibilidades vencidas há mais de um dia (a leitura já ignora as vencidas). */
export async function purgeExpiredSparring(): Promise<number> {
  const r = await db.delete(sparringAvailability).where(lt(sparringAvailability.expiresAt, sql`now() - interval '1 day'`)).returning({ id: sparringAvailability.id });
  return r.length;
}
