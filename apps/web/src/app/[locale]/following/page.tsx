import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { X } from 'lucide-react';
import { FOLLOW_MAX, analysesForMatches, followedFeed, followingOf } from '@aoe2/sync';
import { Link } from '@/i18n/navigation';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { DivisionMark } from '@/components/division-mark';
import { Flag } from '@/components/flag';
import { MatchRow } from '@/components/match-row';
import { divisionName } from '@/lib/leagues';
import { agoParts } from '@/lib/format';
import { getSession } from '@/lib/session';
import { unfollowAction } from '../players/actions';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'following' });
  return { title: t('title') };
}

export default async function FollowingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('following');
  const tn = await getTranslations('nav');
  const tp = await getTranslations('player');
  const tc = await getTranslations('common');
  const td = await getTranslations('division');
  const crumbs = <Breadcrumbs items={[{ label: t('title') }]} />;

  const session = await getSession();
  if (!session) {
    return (
      <>
        {crumbs}
        <div className="panel mx-auto max-w-md p-8 text-center">
          <h1 className="text-2xl text-gold-300">{t('title')}</h1>
          <p className="mt-3 text-parchment-200">{t('notLogged')}</p>
          <Link href="/login" className="btn mt-6">{tn('login')}</Link>
        </div>
      </>
    );
  }

  const rows = await followingOf(session.uid);
  const feed = await followedFeed(session.uid, 20);
  // status da análise de cada partida, do ponto de vista do seguido daquela linha
  const analyses = new Map<string, string>();
  for (const subject of new Set(feed.map((f) => f.subject))) {
    const ids = feed.filter((f) => f.subject === subject).map((f) => f.match.id);
    for (const [matchId, status] of await analysesForMatches(subject, ids)) analyses.set(`${matchId}:${subject}`, status);
  }

  return (
    <div className="space-y-10">
      {crumbs}
      <header>
        <p className="kicker">{t('kicker')}</p>
        <h1 className="mt-1 text-3xl font-semibold text-gold-300">{t('title')}</h1>
        <p className="mt-2 text-parchment-300">{t('count', { n: rows.length, max: FOLLOW_MAX })}</p>
      </header>

      {rows.length === 0 ? (
        <div className="panel p-6 text-parchment-200">
          {t('empty')} <Link href="/">{t('emptyLink')} →</Link>
        </div>
      ) : (
        <section className="panel p-4 sm:p-6">
          <table className="w-full border-collapse text-sm">
            <thead className="text-xs whitespace-nowrap uppercase tracking-wider text-parchment-400">
              <tr>
                <th className="py-1 pl-2 text-left font-normal">{t('col.player')}</th>
                <th className="py-1 pl-2 text-right font-normal">{t('col.rating')}</th>
                <th className="py-1 pl-2 text-right font-normal">{t('col.week')}</th>
                <th className="hidden py-1 pl-2 text-right font-normal sm:table-cell">{t('col.last')}</th>
                <th className="w-8 py-1 font-normal"><span className="sr-only">{t('unfollow')}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ago = agoParts(r.lastMatchAt);
                return (
                  <tr key={r.playerId} className="border-t border-gold-700/40">
                    <td className="w-full max-w-0 py-2 pl-2">
                      <Link href={`/players/${r.profileId}`} className="flex min-w-0 items-center gap-2 !text-parchment-50">
                        <Flag code={r.country} />
                        <span className="truncate">{r.alias}</span>
                        {r.division && (
                          <span className="inline-flex flex-none items-center gap-1 rounded-[2px] border border-gold-700 bg-black/25 px-1.5 text-[0.72rem] text-parchment-200">
                            <DivisionMark nameKey={r.division.nameKey} className="h-3 w-3" />{divisionName(r.division, td)}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="stat-num py-2 pl-2 text-right text-lg">{r.rating ?? '–'}</td>
                    <td className={`stat-num py-2 pl-2 text-right ${r.weekDelta == null || r.weekDelta === 0 ? 'text-parchment-400' : r.weekDelta > 0 ? 'text-moss-500' : 'text-crimson-500'}`}>
                      {r.weekDelta == null ? '–' : r.weekDelta > 0 ? `▲ +${r.weekDelta}` : r.weekDelta < 0 ? `▼ ${r.weekDelta}` : '0'}
                    </td>
                    <td className="hidden py-2 pl-2 text-right whitespace-nowrap text-parchment-300 sm:table-cell">{ago ? tc(`ago.${ago.key}`, { n: ago.n }) : '–'}</td>
                    <td className="py-2 pl-2 text-right">
                      <form action={unfollowAction}>
                        <input type="hidden" name="playerId" value={r.playerId} />
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="back" value="following" />
                        <button type="submit" title={t('unfollow')} aria-label={`${t('unfollow')}: ${r.alias}`} className="flex cursor-pointer p-1 text-parchment-400 hover:text-crimson-500">
                          <X className="h-4 w-4" />
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-parchment-400">{t('weekHint')}</p>
        </section>
      )}

      {rows.length > 0 && (
        <section>
          <div className="rule mb-5"><span className="kicker">{t('feed')}</span></div>
          {feed.length === 0 ? (
            <p className="italic text-parchment-400">{t('feedEmpty')}</p>
          ) : (
            <ul className="space-y-2">
              {feed.map(({ match, subject }) => (
                <MatchRow
                  key={match.id}
                  match={match}
                  me={subject}
                  locale={locale}
                  showSelf
                  analysis={analyses.get(`${match.id}:${subject}`) ?? null}
                  labels={{
                    win: tp('win'), loss: tp('loss'), vs: tp('vs'), team: tp('team'), unknownMap: tp('unknownMap'), type: (k) => tp(`matchType.${k}`),
                    viewAnalysis: tp('viewAnalysis'), analysisPending: tp('analysisPending'),
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
