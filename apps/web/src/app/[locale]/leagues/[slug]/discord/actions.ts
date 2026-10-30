'use server';

import { revalidatePath } from 'next/cache';
import { db, divisions, leagues } from '@aoe2/db';
import { deleteLeagueWebhook, getLeagueWebhook, maskWebhookUrl, saveLeagueWebhook, sendDiscordTest } from '@aoe2/sync';
import { eq } from 'drizzle-orm';
import { redirect } from '@/i18n/navigation';
import { getSession } from '@/lib/session';

const localeOf = (fd: FormData) => (fd.get('locale') === 'en' ? 'en' : 'pt');

/** Liga do formulário, só se o usuário logado for o dono. */
async function ownedLeague(fd: FormData) {
  const session = await getSession();
  const leagueId = Number(fd.get('leagueId'));
  if (!session || !Number.isInteger(leagueId)) return null;
  const league = await db.query.leagues.findFirst({ where: eq(leagues.id, leagueId) });
  if (!league || league.ownerUserId !== session.uid) return null;
  return league;
}

type Outcome = 'saved' | 'removed' | 'url';

/**
 * Grava o formulário. URL igual à versão mascarada = mantém a salva; campo vazio = remove o webhook.
 * Todas as divisões marcadas viram division_ids null (saveLeagueWebhook resolve).
 */
async function persist(fd: FormData, leagueId: number): Promise<Outcome> {
  const typed = String(fd.get('url') ?? '').trim();
  const current = await getLeagueWebhook(leagueId);
  if (!typed) {
    await deleteLeagueWebhook(leagueId);
    return 'removed';
  }
  const url = current && typed === maskWebhookUrl(current.url) ? current.url : typed;
  const events = fd.getAll('events').map(String);
  const divIds = fd.getAll('div').map(Number).filter(Number.isInteger);
  const all = await db.select({ id: divisions.id }).from(divisions).where(eq(divisions.leagueId, leagueId));
  const r = await saveLeagueWebhook(leagueId, {
    url, events, divisionIds: divIds.length === all.length ? null : divIds, enabled: true,
  });
  return r.ok ? 'saved' : 'url';
}

function done(locale: 'pt' | 'en', slug: string, query: string): never {
  revalidatePath(`/${locale}/leagues/${slug}/discord`);
  redirect({ href: `/leagues/${slug}/discord?${query}`, locale });
  throw new Error('unreachable');
}

export async function saveDiscordAction(fd: FormData) {
  const locale = localeOf(fd);
  const league = await ownedLeague(fd);
  if (!league) return;
  const r = await persist(fd, league.id);
  done(locale, league.slug, r === 'url' ? 'err=url' : `ok=${r}`);
}

/** Salva o que está no formulário e manda o teste pra essa URL. */
export async function testDiscordAction(fd: FormData) {
  const locale = localeOf(fd);
  const league = await ownedLeague(fd);
  if (!league) return;
  const r = await persist(fd, league.id);
  if (r !== 'saved') done(locale, league.slug, r === 'url' ? 'err=url' : 'ok=removed');
  const sent = await sendDiscordTest(league.id);
  done(locale, league.slug, sent.ok ? 'ok=test' : 'err=test');
}
