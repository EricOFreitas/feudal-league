'use server';

import { revalidatePath } from 'next/cache';
import { db, leagueMatches, leagues } from '@aoe2/db';
import { createLeague, joinLeague, leaveLeague, restoreLeagueMatch, startNewSeason, voidLeagueMatch } from '@aoe2/sync';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { redirect } from '@/i18n/navigation';
import { sessionPlayer, slugify } from '@/lib/leagues';
import { getSession } from '@/lib/session';

const idOf = (fd: FormData, k: string) => Number(fd.get(k));
const localeOf = (fd: FormData) => (fd.get('locale') === 'en' ? 'en' : 'pt');

async function ownedLeague(fd: FormData) {
  const session = await getSession();
  const leagueId = idOf(fd, 'leagueId');
  if (!session || !Number.isInteger(leagueId)) return null;
  const league = await db.query.leagues.findFirst({ where: eq(leagues.id, leagueId) });
  if (!league || league.ownerUserId !== session.uid) return null;
  return league;
}

export async function joinAction(fd: FormData) {
  const locale = localeOf(fd);
  const slug = String(fd.get('slug') ?? '');
  const { player } = await sessionPlayer();
  if (!player) redirect({ href: `/leagues/${slug}`, locale });
  const r = await joinLeague(idOf(fd, 'leagueId'), player!.id);
  revalidatePath(`/${locale}/leagues/${slug}`);
  redirect({ href: `/leagues/${slug}?${r.ok ? 'joined=1' : `err=${r.reason}`}`, locale });
}

export async function leaveAction(fd: FormData) {
  const locale = localeOf(fd);
  const slug = String(fd.get('slug') ?? '');
  const { player } = await sessionPlayer();
  if (player) await leaveLeague(idOf(fd, 'leagueId'), player.id);
  revalidatePath(`/${locale}/leagues/${slug}`);
  redirect({ href: `/leagues/${slug}?left=1`, locale });
}

export async function voidMatchAction(fd: FormData) {
  const locale = localeOf(fd);
  const league = await ownedLeague(fd);
  if (!league) return;
  const id = idOf(fd, 'leagueMatchId');
  const lm = await db.query.leagueMatches.findFirst({ where: and(eq(leagueMatches.id, id), eq(leagueMatches.leagueId, league.id)) });
  if (!lm) return;
  const reason = String(fd.get('reason') ?? '').trim().slice(0, 200) || null;
  if (lm.status === 'voided') await restoreLeagueMatch(id); else await voidLeagueMatch(id, reason);
  revalidatePath(`/${locale}/leagues/${league.slug}`);
  // volta pra mesma aba/página/filtro; só aceita querystring simples (nada de outra origem)
  const back = String(fd.get('back') ?? '');
  const qs = back.length <= 500 && /^[A-Za-z0-9%&=+._*-]*$/.test(back) ? back : '';
  redirect({ href: `/leagues/${league.slug}${qs ? `?${qs}` : ''}`, locale });
}

export async function newSeasonAction(fd: FormData) {
  const locale = localeOf(fd);
  const league = await ownedLeague(fd);
  if (!league) return;
  await startNewSeason(league.id);
  revalidatePath(`/${locale}/leagues/${league.slug}`);
  redirect({ href: `/leagues/${league.slug}`, locale });
}

export async function toggleStatusAction(fd: FormData) {
  const locale = localeOf(fd);
  const league = await ownedLeague(fd);
  if (!league) return;
  await db.update(leagues).set({ status: league.status === 'open' ? 'closed' : 'open' }).where(eq(leagues.id, league.id));
  revalidatePath(`/${locale}/leagues/${league.slug}`);
  redirect({ href: `/leagues/${league.slug}`, locale });
}

const divisionRow = z.object({
  nameKey: z.string().max(16).optional(),
  name: z.string().trim().max(40),
  defaultName: z.string().max(40).optional(),
  min: z.coerce.number().int().min(0).max(5000),
  max: z.union([z.literal(''), z.coerce.number().int().min(0).max(5000)]),
});

export type CreateState = { error?: 'name' | 'divisions' | 'overlap' | 'slug' } | null;

export async function createLeagueAction(_prev: CreateState, fd: FormData): Promise<CreateState> {
  const locale = localeOf(fd);
  const session = await getSession();
  if (!session) redirect({ href: '/login', locale });

  const name = String(fd.get('name') ?? '').trim();
  if (name.length < 3 || name.length > 60) return { error: 'name' };
  const description = String(fd.get('description') ?? '').trim().slice(0, 2000) || null;
  const countRanked = fd.get('countRanked') === 'on';
  const minGames = Math.min(200, Math.max(0, Number(fd.get('minGames')) || 0));

  const rows: z.infer<typeof divisionRow>[] = [];
  for (let i = 0; i < 8; i++) {
    if (fd.get(`div.${i}.name`) == null) continue;
    const parsed = divisionRow.safeParse({
      nameKey: fd.get(`div.${i}.nameKey`) ?? undefined, name: fd.get(`div.${i}.name`), defaultName: fd.get(`div.${i}.defaultName`) ?? undefined,
      min: fd.get(`div.${i}.min`), max: fd.get(`div.${i}.max`) ?? '',
    });
    if (!parsed.success) continue;
    if (!parsed.data.name) continue;
    rows.push(parsed.data);
  }
  if (rows.length === 0) return { error: 'divisions' };
  const divs = rows
    .map((r) => ({
      nameKey: r.nameKey && r.name === r.defaultName ? r.nameKey : null,
      name: r.nameKey && r.name === r.defaultName ? null : r.name,
      ratingMin: r.min, ratingMax: r.max === '' ? null : r.max,
    }))
    .sort((a, b) => a.ratingMin - b.ratingMin);
  for (let i = 0; i < divs.length; i++) {
    const d = divs[i]!;
    if (d.ratingMax != null && d.ratingMax < d.ratingMin) return { error: 'overlap' };
    const next = divs[i + 1];
    if (next && (d.ratingMax == null || next.ratingMin <= d.ratingMax)) return { error: 'overlap' };
  }

  let slug = slugify(name);
  const taken = await db.query.leagues.findFirst({ where: eq(leagues.slug, slug) });
  if (taken) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }
  const id = await createLeague({ slug, name, description, ownerUserId: session!.uid, countRanked, minGames, divisions: divs });
  if (!id) return { error: 'slug' };
  revalidatePath(`/${locale}/leagues`);
  redirect({ href: `/leagues/${slug}`, locale });
  return null;
}

