'use server';

import { revalidatePath } from 'next/cache';
import { db, players } from '@aoe2/db';
import { follow, unfollow } from '@aoe2/sync';
import { eq } from 'drizzle-orm';
import { redirect } from '@/i18n/navigation';
import { getSession } from '@/lib/session';

const localeOf = (fd: FormData) => (fd.get('locale') === 'en' ? 'en' : 'pt');

async function target(fd: FormData) {
  const playerId = Number(fd.get('playerId'));
  if (!Number.isInteger(playerId) || playerId <= 0) return null;
  return (await db.query.players.findFirst({ where: eq(players.id, playerId), columns: { id: true, profileId: true } })) ?? null;
}

/** Volta pra página de onde veio: o perfil do jogador ou a lista "Seguindo". */
function back(fd: FormData, profileId: number, qs = '') {
  const locale = localeOf(fd);
  const href = fd.get('back') === 'following' ? '/following' : `/players/${profileId}`;
  revalidatePath(`/${locale}${href}`);
  redirect({ href: `${href}${qs}`, locale });
}

export async function followAction(fd: FormData) {
  const session = await getSession();
  const p = await target(fd);
  if (!session) redirect({ href: '/login', locale: localeOf(fd) });
  if (!p) return;
  const r = await follow(session!.uid, p.id);
  back(fd, p.profileId, r.ok ? '' : '?follow=limit');
}

export async function unfollowAction(fd: FormData) {
  const session = await getSession();
  const p = await target(fd);
  if (!session || !p) return;
  await unfollow(session.uid, p.id);
  back(fd, p.profileId);
}
