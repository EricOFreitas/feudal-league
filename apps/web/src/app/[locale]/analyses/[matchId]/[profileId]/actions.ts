'use server';

import { getLocale } from 'next-intl/server';
import { requestAnalysis, retryAnalysis } from '@aoe2/sync';
import { redirect } from '@/i18n/navigation';
import { getSession } from '@/lib/session';

function ids(fd: FormData) {
  const matchId = Number(fd.get('matchId'));
  const profileId = Number(fd.get('profileId'));
  if (!Number.isInteger(matchId) || !Number.isInteger(profileId)) throw new Error('ids inválidos');
  return { matchId, profileId, href: `/analyses/${matchId}/${profileId}` };
}

export async function requestAnalysisAction(fd: FormData) {
  const { matchId, profileId, href } = ids(fd);
  const locale = await getLocale();
  const session = await getSession();
  if (!session) return redirect({ href: `${href}?err=not_owner`, locale });
  const r = await requestAnalysis({ matchId, profileId, userId: session.uid, locale });
  redirect({ href: r.ok ? href : `${href}?err=${r.reason}`, locale });
}

export async function retryAnalysisAction(fd: FormData) {
  const { matchId, profileId, href } = ids(fd);
  const locale = await getLocale();
  const session = await getSession();
  if (session) await retryAnalysis(matchId, profileId, session.uid);
  redirect({ href, locale });
}
