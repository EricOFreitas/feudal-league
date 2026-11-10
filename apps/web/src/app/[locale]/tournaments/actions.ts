'use server';

import { revalidatePath } from 'next/cache';
import { db, tournamentMatches, tournamentTeams, tournaments } from '@aoe2/db';
import { BEST_OFS, TEAM_SIZES, addTeam, createTournament, deleteTeam, recordGame, setTeamStatus, startBracket, startGroups, undoLastGame, updateTournament, type AddTeamResult, type TournamentSettings } from '@aoe2/sync';
import { and, eq } from 'drizzle-orm';
import { redirect } from '@/i18n/navigation';
import { sessionPlayer, slugify } from '@/lib/leagues';
import { getSession } from '@/lib/session';

const idOf = (fd: FormData, k: string) => Number(fd.get(k));
const localeOf = (fd: FormData) => (fd.get('locale') === 'en' ? 'en' : 'pt');
const intOrNull = (v: FormDataEntryValue | null, min: number, max: number) => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

async function owned(fd: FormData) {
  const session = await getSession();
  const id = idOf(fd, 'tournamentId');
  if (!session || !Number.isInteger(id)) return null;
  const t = await db.query.tournaments.findFirst({ where: eq(tournaments.id, id) });
  return t && t.ownerUserId === session.uid ? t : null;
}

function back(fd: FormData, query = '') {
  const locale = localeOf(fd);
  const slug = String(fd.get('slug') ?? '');
  revalidatePath(`/${locale}/tournaments/${slug}`);
  redirect({ href: `/tournaments/${slug}${query ? `?${query}` : ''}`, locale });
}

function failQuery(r: Extract<AddTeamResult, { ok: false }>) {
  const q = new URLSearchParams({ err: r.reason });
  if (r.profileId) q.set('id', String(r.profileId));
  if (r.eligibility) q.set('rules', r.eligibility.fails.join(','));
  return q.toString();
}

function profileIdsFrom(fd: FormData, prefix: string, n: number) {
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = Number(String(fd.get(`${prefix}.${i}`) ?? '').trim());
    if (Number.isInteger(v) && v > 0) ids.push(v);
  }
  return ids;
}

export async function registerTeamAction(fd: FormData) {
  const { session, player } = await sessionPlayer();
  const t = await db.query.tournaments.findFirst({ where: eq(tournaments.id, idOf(fd, 'tournamentId')) });
  if (!session || !player || !t) return back(fd, 'err=closed');
  const partners = profileIdsFrom(fd, 'partner', Math.max(0, t.teamSize - 1));
  const r = await addTeam(t.id, { profileIds: [player.profileId, ...partners], byUserId: session.uid, status: 'pending', captainProfileId: player.profileId, name: String(fd.get('name') ?? '') });
  return back(fd, r.ok ? 'ok=registered' : failQuery(r));
}

export async function addTeamAction(fd: FormData) {
  const t = await owned(fd);
  if (!t) return;
  const session = await getSession();
  const ids = profileIdsFrom(fd, 'player', t.teamSize);
  const r = await addTeam(t.id, { profileIds: ids, byUserId: session?.uid, status: 'confirmed', name: String(fd.get('name') ?? ''), skipEligibility: fd.get('skipEligibility') === 'on' });
  return back(fd, r.ok ? 'ok=added' : failQuery(r));
}

export async function teamStatusAction(fd: FormData) {
  const t = await owned(fd);
  if (!t) return;
  const teamId = idOf(fd, 'teamId');
  const team = await db.query.tournamentTeams.findFirst({ where: and(eq(tournamentTeams.id, teamId), eq(tournamentTeams.tournamentId, t.id)) });
  if (!team) return back(fd);
  const op = String(fd.get('op'));
  if (op === 'remove' && t.status === 'open') await deleteTeam(teamId);
  else if (op === 'confirm') await setTeamStatus(teamId, 'confirmed');
  else if (op === 'unconfirm' && t.status === 'open') await setTeamStatus(teamId, 'pending');
  else if (op === 'withdraw') await setTeamStatus(teamId, 'withdrawn');
  return back(fd);
}

export async function startGroupsAction(fd: FormData) {
  const t = await owned(fd);
  if (!t) return;
  const r = await startGroups(t.id);
  return back(fd, r.ok ? '' : `err=${r.reason}`);
}

export async function startBracketAction(fd: FormData) {
  const t = await owned(fd);
  if (!t) return;
  const r = await startBracket(t.id);
  return back(fd, r.ok ? '' : `err=${r.reason}`);
}

export async function cancelAction(fd: FormData) {
  const t = await owned(fd);
  if (!t) return;
  await db.update(tournaments).set({ status: 'cancelled' }).where(eq(tournaments.id, t.id));
  const locale = localeOf(fd);
  revalidatePath(`/${locale}/tournaments`);
  redirect({ href: '/tournaments', locale });
}

export async function reportGameAction(fd: FormData) {
  const t = await owned(fd);
  if (!t) return;
  const session = await getSession();
  const matchId = idOf(fd, 'matchId');
  const m = await db.query.tournamentMatches.findFirst({ where: and(eq(tournamentMatches.id, matchId), eq(tournamentMatches.tournamentId, t.id)) });
  if (!m) return back(fd);
  await recordGame(m.id, idOf(fd, 'winnerTeamId'), { source: 'manual', byUserId: session?.uid });
  return back(fd);
}

export async function undoGameAction(fd: FormData) {
  const t = await owned(fd);
  if (!t) return;
  const matchId = idOf(fd, 'matchId');
  const m = await db.query.tournamentMatches.findFirst({ where: and(eq(tournamentMatches.id, matchId), eq(tournamentMatches.tournamentId, t.id)) });
  if (m) await undoLastGame(m.id);
  return back(fd);
}

export type CreateState = { error?: 'name' | 'groups' | 'slug' | 'max_teams' | 'status' } | null;

const bestOfOr = <T,>(v: FormDataEntryValue | null, fallback: T) => ((BEST_OFS as readonly number[]).includes(Number(v)) ? Number(v) : fallback);

/** Lê as configurações do formulário (criar e editar). Sem a caixa de grupos marcada, grupos = 0. */
function settingsFrom(fd: FormData): TournamentSettings | { error: 'name' | 'groups' } {
  const name = String(fd.get('name') ?? '').trim();
  if (name.length < 3 || name.length > 60) return { error: 'name' };
  const groupCount = fd.get('hasGroups') === 'on' ? intOrNull(fd.get('groupCount'), 1, 16) ?? 0 : 0;
  const advancePerGroup = intOrNull(fd.get('advancePerGroup'), 1, 8) ?? 2;
  if (fd.get('hasGroups') === 'on' && groupCount < 1) return { error: 'groups' };
  const startsRaw = String(fd.get('startsAt') ?? '').trim();
  const startsAt = startsRaw ? new Date(startsRaw) : null;
  return {
    name, description: String(fd.get('description') ?? '').trim().slice(0, 4000) || null,
    organizerName: String(fd.get('organizerName') ?? '').trim().slice(0, 60) || null, registrationClosed: fd.get('registrationClosed') === 'on',
    teamSize: (TEAM_SIZES as readonly number[]).includes(Number(fd.get('teamSize'))) ? Number(fd.get('teamSize')) : 2,
    bestOf: bestOfOr(fd.get('bestOf'), 1), finalBestOf: bestOfOr(fd.get('finalBestOf'), null),
    groupCount, advancePerGroup, groupBestOf: bestOfOr(fd.get('groupBestOf'), 1), groupPlayAll: groupCount > 0 && fd.get('groupPlayAll') === 'on',
    maxTeams: intOrNull(fd.get('maxTeams'), 2, 256), startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : null,
    maxPeakRating: intOrNull(fd.get('maxPeakRating'), 0, 5000), minGames: intOrNull(fd.get('minGames'), 0, 10000), minRecentGames: intOrNull(fd.get('minRecentGames'), 0, 1000),
    prize: String(fd.get('prize') ?? '').trim().slice(0, 300) || null,
  };
}

export async function createTournamentAction(_prev: CreateState, fd: FormData): Promise<CreateState> {
  const locale = localeOf(fd);
  const session = await getSession();
  if (!session) redirect({ href: '/login', locale });
  const settings = settingsFrom(fd);
  if ('error' in settings) return { error: settings.error };

  let slug = slugify(settings.name);
  if (await db.query.tournaments.findFirst({ where: eq(tournaments.slug, slug) })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const id = await createTournament({ ...settings, slug, ownerUserId: session!.uid });
  if (!id) return { error: 'slug' };
  revalidatePath(`/${locale}/tournaments`);
  redirect({ href: `/tournaments/${slug}`, locale });
  return null;
}

/** Edita o torneio (só o dono). Campos travados chegam desabilitados no formulário e o servidor mantém o valor atual. */
export async function updateTournamentAction(_prev: CreateState, fd: FormData): Promise<CreateState> {
  const t = await owned(fd);
  if (!t) return { error: 'status' };
  const settings = settingsFrom(fd);
  if ('error' in settings) return { error: settings.error };
  // updateTournament ignora o formato fora das inscrições e o tamanho com times inscritos
  const r = await updateTournament(t.id, settings);
  if (!r.ok) return { error: r.reason };
  back(fd, 'ok=edited');
  return null;
}
