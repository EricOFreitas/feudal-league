import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Globe, ShieldCheck, Users } from 'lucide-react';
import { RM_1V1 } from '@aoe2/aoe-api';
import { db, divisions, leagues, players } from '@aoe2/db';
import { activeSeason, placementFor, recentLeagueMatches, standings } from '@aoe2/sync';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { leagueMembers } from '@aoe2/db';
import { Link } from '@/i18n/navigation';
import { Flag } from '@/components/flag';
import { DivisionMark } from '@/components/division-mark';
import { divisionName, sessionPlayer } from '@/lib/leagues';
import { mapLabel } from '@/lib/format';
import { joinAction, leaveAction, newSeasonAction, toggleStatusAction, voidMatchAction } from '../actions';

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ joined?: string; left?: string; err?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const l = await db.query.leagues.findFirst({ where: eq(leagues.slug, slug) });
  return { title: l?.name ?? slug };
}

export default async function LeaguePage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const flash = await searchParams;
  const t = await getTranslations('leagues');
  const td = await getTranslations('division');
  const tp = await getTranslations('player');

  const league = await db.query.leagues.findFirst({ where: eq(leagues.slug, slug) });
  if (!league || league.status === 'archived') notFound();
  const season = await activeSeason(league.id);
  const divs = await db.query.divisions.findMany({ where: eq(divisions.leagueId, league.id), orderBy: [asc(divisions.sort)] });
  const { session, player } = await sessionPlayer();
  const isOwner = session != null && league.ownerUserId === session.uid;
  const owner = league.ownerUserId ? await db.query.players.findFirst({ where: eq(players.claimedByUserId, league.ownerUserId) }) : null;

  const membership = player && season
    ? await db.query.leagueMembers.findFirst({ where: and(eq(leagueMembers.seasonId, season.id), eq(leagueMembers.playerId, player.id), isNull(leagueMembers.leftAt)), with: { division: true } })
    : null;
  const placement = player && !membership ? placementFor(league, divs, player.ratings.find((r) => r.leaderboardId === RM_1V1)) : null;

  const tables = season ? await Promise.all(divs.map(async (d) => ({ d, rows: await standings(season.id, d.id) }))) : [];
  const matches = season ? await recentLeagueMatches(season.id, undefined, 30) : [];
  const dt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const dtm = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' });
  const joinError = (reason: string) => {
    const known = ['closed', 'already', 'no_rating', 'few_games', 'no_division', 'no_season'] as const;
    const k = known.find((x) => x === reason) ?? 'closed';
    return t(`join.${k}`, { games: placement && !placement.ok ? placement.games : 0, min: league.minGames, rating: placement?.rating ?? 0, division: membership ? divisionName(membership.division, td) : '' });
  };
  const fmtRange = (d: { ratingMin: number; ratingMax: number | null }) => (d.ratingMax == null ? t('rangeOpen', { min: d.ratingMin }) : t('range', { min: d.ratingMin, max: d.ratingMax }));
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="leagueId" value={league.id} />
      <input type="hidden" name="slug" value={league.slug} />
    </>
  );

  return (
    <div className="space-y-10">
      {flash.joined && membership && <div className="panel border-moss-500 p-4 text-parchment-50">{t('join.done', { division: divisionName(membership.division, td) })}</div>}
      {flash.left && <div className="panel p-4 text-parchment-50">{t('join.left')}</div>}
      {flash.err && <div className="panel border-crimson-500 p-4 text-parchment-50">{joinError(flash.err)}</div>}

      <header className="panel corners p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="kicker flex items-center gap-2">
              {league.isGlobal ? <Globe className="h-3.5 w-3.5" /> : null}
              {season ? t('season', { n: season.number }) : ''} {season && <span className="normal-case tracking-normal text-parchment-400">· {t('seasonSince', { date: dt.format(season.startedAt) })}</span>}
            </p>
            <h1 className="text-3xl font-semibold text-gold-300 sm:text-4xl">{league.isGlobal ? t('global') : league.name}</h1>
            {league.description && <p className="mt-2 max-w-2xl whitespace-pre-line text-parchment-200">{league.description}</p>}
            <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-parchment-300">
              <span className="tag"><Users className="h-3.5 w-3.5" />{t('members', { count: tables.reduce((n, x) => n + x.rows.length, 0) })}</span>
              {owner && <span>{t('by', { name: '' })}<Link href={`/players/${owner.profileId}`}>{owner.alias}</Link></span>}
              {isOwner && <span className="tag border-moss-500"><ShieldCheck className="h-3.5 w-3.5 text-moss-500" />{t('ownerYou')}</span>}
              {league.status === 'closed' && <span className="text-crimson-500">{t('closed')}</span>}
            </p>
          </div>

          <div className="shrink-0 sm:text-right">
            {!session ? (
              <a href={`/auth/steam?next=/${locale}/leagues/${league.slug}`} className="btn">{t('join.login')}</a>
            ) : !player ? (
              <Link href="/me" className="btn btn-ghost">{t('join.claim')}</Link>
            ) : membership ? (
              <form action={leaveAction} className="space-y-2">
                {hidden}
                <p className="flex items-center gap-2 text-parchment-50 sm:justify-end"><DivisionMark nameKey={membership.division.nameKey} className="h-5 w-5 text-gold-400" />{t('join.already', { division: divisionName(membership.division, td) })}</p>
                <button type="submit" className="btn btn-ghost !text-xs">{t('join.leave')}</button>
              </form>
            ) : league.status !== 'open' ? (
              <p className="text-parchment-300">{t('join.closed')}</p>
            ) : placement?.ok ? (
              <form action={joinAction} className="space-y-2">
                {hidden}
                <p className="text-sm text-parchment-200">{t('join.preview', { division: divisionName(placement.division, td), rating: placement.rating })}</p>
                <button type="submit" className="btn">{t('join.button')}</button>
              </form>
            ) : placement ? (
              <p className="max-w-xs text-sm text-parchment-300">{t(`join.${placement.reason}`, { games: placement.games, min: league.minGames, rating: placement.rating })}</p>
            ) : null}
          </div>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-8">
          {tables.map(({ d, rows }) => (
            <article key={d.id} className={`panel ${rows.length === 0 ? 'px-5 py-3' : 'p-5'}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-2 text-2xl text-gold-300"><DivisionMark nameKey={d.nameKey} className="h-6 w-6 text-gold-400" />{divisionName(d, td)}</h2>
                <span className="stat-num text-parchment-300">{fmtRange(d)}</span>
              </div>
              {rows.length === 0 ? (
                <p className="mt-1 text-sm italic text-parchment-400">{t('noMembers')}</p>
              ) : (
                <table className="mt-3 w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-parchment-400">
                    <tr><th className="py-1 pr-2">{t('col.pos')}</th><th className="py-1">{t('col.player')}</th><th className="py-1 text-right">{t('col.rating')}</th><th className="py-1 text-right">{t('col.w')}</th><th className="py-1 text-right">{t('col.l')}</th><th className="py-1 text-right">{t('col.pts')}</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.playerId} className={`border-t border-gold-700/40 ${player?.id === r.playerId ? 'bg-gold-700/15' : ''}`}>
                        <td className="stat-num py-1.5 pr-2">{i + 1}</td>
                        <td className="py-1.5"><Link href={`/players/${r.profileId}`} className="inline-flex items-center gap-2 text-parchment-50"><Flag code={r.country} />{r.alias}</Link></td>
                        <td className="py-1.5 text-right text-parchment-300">{r.placementRating}</td>
                        <td className="py-1.5 text-right text-moss-500">{r.wins}</td>
                        <td className="py-1.5 text-right text-crimson-500">{r.losses}</td>
                        <td className="stat-num py-1.5 text-right text-lg">{r.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </article>
          ))}
        </div>

        <aside className="space-y-4">
          <div className="panel p-5">
            <p className="kicker">{t('rules.title')}</p>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-parchment-200">
              <li>{t('rules.placement')}</li>
              <li>{t('rules.minGames', { n: league.minGames })}</li>
              <li>{league.countRanked ? t('rules.detect') : t('rules.detectLobby')}</li>
              <li>{t('rules.points')}</li>
              <li>{t('rules.season')}</li>
            </ul>
          </div>
          {isOwner && (
            <div className="panel space-y-3 p-5">
              <p className="kicker">{t('admin.title')}</p>
              <form action={toggleStatusAction}>{hidden}<button className="btn btn-ghost w-full !text-xs">{league.status === 'open' ? t('admin.close') : t('admin.open')}</button></form>
              <form action={newSeasonAction}>
                {hidden}
                <button className="btn btn-ghost w-full !text-xs">{t('admin.newSeason')}</button>
                <p className="mt-1 text-xs text-parchment-400">{t('admin.newSeasonHint')}</p>
              </form>
            </div>
          )}
        </aside>
      </section>

      <section>
        <div className="rule mb-5"><span className="kicker">{t('matches')}</span></div>
        {matches.length === 0 ? (
          <p className="italic text-parchment-400">{t('noMatches')}</p>
        ) : (
          <ul className="space-y-2">
            {matches.map((lm) => {
              const wm = lm.match.members.find((m) => m.profileId === lm.winner.profileId);
              const lmm = lm.match.members.find((m) => m.profileId === lm.loser.profileId);
              return (
                <li key={lm.id} className={`panel flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between ${lm.status === 'voided' ? 'opacity-60' : ''}`}>
                  <div className="min-w-0 space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tag"><DivisionMark nameKey={lm.division.nameKey} className="h-3.5 w-3.5" />{divisionName(lm.division, td)}</span>
                      <Link href={`/players/${lm.winner.profileId}`} className="font-display text-parchment-50">{lm.winner.alias}</Link>
                      <span className="text-parchment-400">({wm?.oldRating ?? '–'})</span>
                      <span className="text-moss-500">{t('beat')}</span>
                      <Link href={`/players/${lm.loser.profileId}`} className="font-display text-parchment-50">{lm.loser.alias}</Link>
                      <span className="text-parchment-400">({lmm?.oldRating ?? '–'})</span>
                      {lm.status === 'voided' && <span className="text-crimson-500">{lm.voidReason ? t('voidedReason', { reason: lm.voidReason }) : t('voided')}</span>}
                    </div>
                    <div className="text-parchment-300">
                      {lm.match.mapName ? mapLabel(lm.match.mapName) : tp('unknownMap')} · {tp(`matchType.${lm.match.matchtypeId === 0 ? 'lobby' : 'ranked1v1'}`)} · {dtm.format(lm.playedAt)}
                    </div>
                  </div>
                  {isOwner && (
                    <form action={voidMatchAction} className="flex shrink-0 items-center gap-2">
                      {hidden}
                      <input type="hidden" name="leagueMatchId" value={lm.id} />
                      {lm.status !== 'voided' && <input name="reason" className="input !w-40 !py-1 !text-sm" placeholder={t('admin.voidReason')} maxLength={200} />}
                      <button className="btn btn-ghost !px-3 !py-1 !text-xs">{lm.status === 'voided' ? t('admin.restore') : t('admin.void')}</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
