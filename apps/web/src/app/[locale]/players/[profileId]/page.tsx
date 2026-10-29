import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { AoeApiError, LEADERBOARD_ORDER } from '@aoe2/aoe-api';
import { db, players } from '@aoe2/db';
import { findPlayerByProfileId, importPlayerByProfileId, syncMatchHistory, syncRatingsByProfileIds, recentMatchesOf } from '@aoe2/sync';
import { eq } from 'drizzle-orm';
import { Flag } from '@/components/flag';
import { RatingCard } from '@/components/rating-card';
import { MatchRow } from '@/components/match-row';
import { getSession } from '@/lib/session';
import { checkAdditionLimit, recordAddition } from '@/lib/additions';
import { agoParts, isKnownLb, lbKey } from '@/lib/format';

type Props = { params: Promise<{ locale: string; profileId: string }>; searchParams: Promise<{ claimed?: string }> };

const STALE_MS = 60 * 60 * 1000;

async function loadPlayer(profileId: number) {
  let player = await findPlayerByProfileId(profileId);
  let apiError: string | null = null;

  if (!player) {
    if (!(await checkAdditionLimit())) return { player: null, apiError: 'rate' as const };
    try {
      const r = await importPlayerByProfileId(profileId);
      if (!r) return { player: null, apiError: null };
      await recordAddition(profileId);
      await syncMatchHistory([profileId]).catch(() => undefined);
      player = await findPlayerByProfileId(profileId);
    } catch (e) {
      return { player: null, apiError: e instanceof AoeApiError ? e.message : 'erro' };
    }
  } else if (!player.lastSyncedAt || Date.now() - player.lastSyncedAt.getTime() > STALE_MS) {
    try {
      await syncRatingsByProfileIds([profileId]);
      await syncMatchHistory([profileId]);
      player = await findPlayerByProfileId(profileId);
    } catch (e) {
      apiError = e instanceof AoeApiError ? e.message : 'erro';
    }
  }
  if (player) await db.update(players).set({ lastViewedAt: new Date() }).where(eq(players.id, player.id));
  return { player: player ?? null, apiError };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { profileId } = await params;
  const p = await findPlayerByProfileId(Number(profileId));
  return { title: p ? p.alias : `#${profileId}` };
}

export default async function PlayerPage({ params, searchParams }: Props) {
  const { locale, profileId: raw } = await params;
  setRequestLocale(locale);
  const profileId = Number(raw);
  if (!Number.isInteger(profileId) || profileId <= 0) notFound();
  const { claimed } = await searchParams;

  const t = await getTranslations('player');
  const tc = await getTranslations('common');
  const tl = await getTranslations('leaderboard');
  const ta = await getTranslations('auth');
  const ts = await getTranslations('search');

  const { player, apiError } = await loadPlayer(profileId);
  if (!player) {
    if (apiError === 'rate') return <div className="panel mx-auto max-w-2xl p-6">{ts('rateLimited')}</div>;
    if (apiError) return <div className="panel mx-auto max-w-2xl p-6">{ts('apiDown')}</div>;
    notFound();
  }

  const session = await getSession();
  const isMine = session != null && player.claimedByUserId === session.uid;
  const canClaim = !player.claimedByUserId && player.steamId64 && (!session || session.sid === player.steamId64);

  const ratings = [...player.ratings].sort((a, b) => LEADERBOARD_ORDER.indexOf(a.leaderboardId as never) - LEADERBOARD_ORDER.indexOf(b.leaderboardId as never));
  const matches = await recentMatchesOf(profileId, 20);
  const ago = agoParts(player.lastSyncedAt);
  const countryName = player.country ? new Intl.DisplayNames([locale], { type: 'region' }).of(player.country.toUpperCase()) : null;

  return (
    <div className="space-y-10">
      {claimed && <div className="panel border-moss-500 p-4 text-parchment-50">{ta('claimDone')}</div>}

      <header className="panel corners flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-4">
          <Flag code={player.country} className="text-5xl leading-none" />
          <div>
            <p className="kicker">{player.clan ? `[${player.clan}]` : countryName ?? ''}</p>
            <h1 className="text-3xl font-semibold text-gold-300 sm:text-4xl">{player.alias}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-parchment-300">
              <span>{t('profileId')} <span className="font-mono text-parchment-200">{player.profileId}</span></span>
              {player.steamId64 && (
                <a href={`https://steamcommunity.com/profiles/${player.steamId64}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">
                  {t('steam')} <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <span className="text-parchment-400">
                {ago ? t('synced', { ago: tc(`ago.${ago.key}`, { n: ago.n }) }) : t('neverSynced')}
              </span>
            </p>
            {(apiError || player.lastSyncError) && <p className="mt-1 text-sm text-crimson-500">{t('syncError', { error: apiError ?? player.lastSyncError ?? '' })}</p>}
          </div>
        </div>
        <div className="shrink-0">
          {isMine ? (
            <span className="tag border-moss-500 text-parchment-50"><ShieldCheck className="h-4 w-4 text-moss-500" />{t('yours')}</span>
          ) : player.claimedByUserId ? (
            <span className="tag"><ShieldCheck className="h-4 w-4 text-gold-400" />{t('claimed')}</span>
          ) : canClaim ? (
            <a href={`/auth/steam?next=/${locale}/players/${player.profileId}?claimed=1`} className="btn btn-ghost">{t('claim')}</a>
          ) : null}
        </div>
      </header>

      <section>
        <div className="rule mb-5"><span className="kicker">{t('ratings')}</span></div>
        {ratings.length === 0 ? (
          <p className="italic text-parchment-400">{t('noRatings')}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ratings.map((r) => (
              <RatingCard
                key={r.leaderboardId}
                r={r}
                title={isKnownLb(r.leaderboardId) ? tl(lbKey(r.leaderboardId) as never) : `Ladder ${r.leaderboardId}`}
                labels={{ rank: t('rank'), of: (total) => t('of', { total }), winrate: t('winrate'), peak: t('peak'), streak: t('streak'), w: t('wins'), l: t('losses') }}
                locale={locale}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="rule mb-5"><span className="kicker">{t('matches')}</span></div>
        {matches.length === 0 ? (
          <p className="italic text-parchment-400">{t('noMatches')}</p>
        ) : (
          <ul className="space-y-2">
            {matches.map((m) => (
              <MatchRow
                key={m.id}
                match={m}
                me={profileId}
                locale={locale}
                labels={{ win: t('win'), loss: t('loss'), vs: t('vs'), team: t('team'), unknownMap: t('unknownMap'), type: (k) => t(`matchType.${k}`) }}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
