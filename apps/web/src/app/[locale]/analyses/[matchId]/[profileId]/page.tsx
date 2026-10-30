import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { civName } from '@aoe2/aoe-api';
import { db, matches, players } from '@aoe2/db';
import { ANALYSIS_DAILY_LIMIT, analysisQuota, getAnalysis } from '@aoe2/sync';
import { eq } from 'drizzle-orm';
import { AutoRefresh } from '@/components/auto-refresh';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { Markdown } from '@/components/markdown';
import { Link } from '@/i18n/navigation';
import { mapLabel, matchTypeKey } from '@/lib/format';
import { getSession } from '@/lib/session';
import { requestAnalysisAction, retryAnalysisAction } from './actions';

type Props = { params: Promise<{ locale: string; matchId: string; profileId: string }>; searchParams: Promise<{ err?: string }> };

const ERRORS = ['no_match', 'not_member', 'not_owner', 'limit'] as const;
type Err = (typeof ERRORS)[number];
const asErr = (e?: string): Err | null => (ERRORS as readonly string[]).includes(e ?? '') ? (e as Err) : null;

/** Minutos até a data (no mínimo 1). Fora do componente: Date.now() é impuro. */
function minutesUntil(d: Date) {
  return Math.max(1, Math.ceil((d.getTime() - Date.now()) / 60000));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { profileId, locale } = await params;
  const t = await getTranslations({ locale, namespace: 'analysis' });
  const p = await db.query.players.findFirst({ where: eq(players.profileId, Number(profileId)) });
  return { title: `${t('title')} · ${p?.alias ?? `#${profileId}`}` };
}

export default async function AnalysisPage({ params, searchParams }: Props) {
  const { locale, matchId: rawM, profileId: rawP } = await params;
  setRequestLocale(locale);
  const matchId = Number(rawM);
  const profileId = Number(rawP);
  if (!Number.isInteger(matchId) || !Number.isInteger(profileId)) notFound();
  const err = asErr((await searchParams).err);

  const t = await getTranslations('analysis');
  const tp = await getTranslations('player');
  const tn = await getTranslations('nav');

  const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId), with: { members: true } });
  if (!match) notFound();
  const me = match.members.find((m) => m.profileId === profileId);
  if (!me) notFound();
  const player = await db.query.players.findFirst({ where: eq(players.profileId, profileId) });
  const name = player?.alias ?? me.alias ?? `#${profileId}`;

  const session = await getSession();
  const isOwner = session != null && player?.claimedByUserId === session.uid;
  const analysis = await getAnalysis(matchId, profileId);
  const quota = isOwner && session ? await analysisQuota(session.uid) : null;
  const remaining = quota?.remaining ?? 0;
  const donate = process.env.DONATION_URL;
  const won = me.outcome === 1;
  const allies = match.members.filter((m) => m.profileId !== profileId && m.team === me.team);
  const foes = match.members.filter((m) => m.team !== me.team);
  const mins = Math.round((match.completedAt.getTime() - match.startedAt.getTime()) / 60000);
  const dt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const inProgress = analysis && ['queued', 'parsing', 'writing'].includes(analysis.status);
  const STEPS = ['queued', 'parsing', 'writing'] as const;
  const stepIdx = analysis ? STEPS.indexOf(analysis.status as (typeof STEPS)[number]) : -1;
  const resetIn = (() => {
    if (!quota?.resetAt) return null;
    const mins = minutesUntil(quota.resetAt);
    return mins >= 60 ? t('quota.hm', { h: Math.floor(mins / 60), m: mins % 60 }) : t('quota.m', { m: mins });
  })();
  const who = (list: typeof match.members) => list.map((m) => `${m.alias ?? `#${m.profileId}`} (${m.oldRating}, ${civName(m.civId)})`).join(', ');

  return (
    <div className="space-y-8">
      <Breadcrumbs items={[{ label: name, href: `/players/${profileId}` }, { label: tn('analysis') }]} />
      {inProgress && <AutoRefresh seconds={5} />}

      <header className="panel corners p-6">
        <p className="kicker">{t('kicker')}</p>
        <h1 className="mt-1 text-3xl font-semibold text-gold-300">{t('title')}</h1>
        <p className="mt-1 text-parchment-300">{t('for', { name })} · <Link href={`/players/${profileId}`}>{t('back')}</Link></p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className={`font-display font-semibold ${won ? 'text-moss-500' : 'text-crimson-500'}`}>{won ? t('match.win') : t('match.loss')}</span>
          <span className="tag">{tp(`matchType.${matchTypeKey(match.matchtypeId)}`)}</span>
          <span className="text-parchment-200">{match.mapName ? mapLabel(match.mapName) : tp('unknownMap')}</span>
          <span className="text-parchment-400">· {civName(me.civId)} · {me.oldRating} → {me.newRating} · {dt.format(match.completedAt)} · {t('match.duration', { n: mins })}</span>
        </div>
        <p className="mt-2 text-sm text-parchment-300">
          {allies.length > 0 && <>{tp('team')}: {who(allies)} · </>}{tp('vs')} {who(foes)}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <section className="panel p-6">
          {err && <p className="mb-4 rounded border border-crimson-500/60 bg-crimson-500/10 p-3 text-sm text-parchment-50">{t(`err.${err}`)}</p>}

          {!analysis && (
            <div className="space-y-4">
              <p className="text-parchment-200">{t('intro')}</p>
              {isOwner ? (
                remaining > 0 ? (
                  <form action={requestAnalysisAction} className="flex flex-wrap items-center gap-3">
                    <input type="hidden" name="matchId" value={matchId} />
                    <input type="hidden" name="profileId" value={profileId} />
                    <button type="submit" className="btn btn-primary"><Sparkles className="h-4 w-4" />{t('request')}</button>
                    <span className="text-sm text-parchment-400">{t('useOne')}</span>
                  </form>
                ) : (
                  <div className="space-y-3">
                    <p className="font-display text-lg text-gold-300">{t('limitTitle', { n: quota?.limit ?? 0 })}</p>
                    <p className="text-parchment-200">{t('limitText')}</p>
                    {resetIn && <p className="text-sm text-parchment-400">{t('quota.resets', { time: resetIn })}</p>}
                  </div>
                )
              ) : session ? (
                <p className="italic text-parchment-400">{t('ownerOnly')}</p>
              ) : (
                <a href={`/auth/steam?next=/${locale}/analyses/${matchId}/${profileId}`} className="btn btn-ghost">{t('login')}</a>
              )}
            </div>
          )}

          {analysis && inProgress && (
            <div className="space-y-4">
              <ol className="space-y-2.5">
                {STEPS.map((k, i) => {
                  const done = i < stepIdx;
                  const current = i === stepIdx;
                  return (
                    <li key={k} className="flex items-center gap-3">
                      <span className={`stat-num flex h-7 w-7 flex-none items-center justify-center rounded-full border text-[0.8rem] ${current ? 'border-gold-400 bg-gold-500/25 text-gold-300' : done ? 'border-moss-500 bg-moss-500/20 text-parchment-100' : 'border-gold-700 text-parchment-400'}`}>{i + 1}</span>
                      <span className={`font-display ${current ? 'text-gold-300' : done ? 'text-parchment-200' : 'text-parchment-400'}`}>{t(`status.${k}`)}{current ? '…' : ''}</span>
                    </li>
                  );
                })}
              </ol>
              <p className="text-sm text-parchment-400">{t('processing')}</p>
            </div>
          )}

          {analysis && analysis.status === 'failed' && (
            <div className="space-y-3">
              <p className="font-display text-lg text-crimson-500">{t('failed')}</p>
              <p className="text-sm text-parchment-300">{analysis.error === 'replay_unavailable' ? t('failedReplay') : analysis.error}</p>
              {isOwner && analysis.error !== 'replay_unavailable' && (
                <form action={retryAnalysisAction}>
                  <input type="hidden" name="matchId" value={matchId} />
                  <input type="hidden" name="profileId" value={profileId} />
                  <button type="submit" className="btn btn-ghost">{t('retry')}</button>
                </form>
              )}
            </div>
          )}

          {analysis && analysis.status === 'done' && analysis.feedback && (
            <article>
              <Markdown text={analysis.feedback} />
              <p className="mt-6 text-xs text-parchment-400">{analysis.model && t('model', { model: analysis.model })}</p>
            </article>
          )}
        </section>

        <aside className="space-y-4">
          {quota && (
            <div className="panel p-5">
              <p className="kicker">{t('quota.title')}</p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="stat-num text-4xl leading-none">{quota.remaining}</span>
                <span className="text-parchment-300">{t('quota.left', { limit: quota.limit })}</span>
              </div>
              <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, quota.limit)}, minmax(0, 1fr))` }}>
                {Array.from({ length: quota.limit }, (_, i) => (
                  <span key={i} className={`h-2 rounded-sm border ${i < quota.remaining ? 'border-gold-500 bg-gold-400' : 'border-gold-700 bg-transparent'}`} />
                ))}
              </div>
              <p className="mt-3 text-sm text-parchment-400">{resetIn ? t('quota.resets', { time: resetIn }) : t('quota.available')}</p>
            </div>
          )}
          <div className="panel p-5">
            <p className="kicker">{t('limits.title')}</p>
            <ul className="mt-3 list-disc space-y-1.5 pl-4 text-sm text-parchment-200">
              <li>{t('limits.i1', { n: quota?.limit ?? ANALYSIS_DAILY_LIMIT })}</li>
              <li>{t('limits.i2')}</li>
              <li>{t('limits.i3')}</li>
              <li>{t('limits.i4')}</li>
            </ul>
            <p className="mt-3 text-xs text-parchment-400">{t('limits.note')}</p>
          </div>
          <div className="panel p-4 text-sm text-parchment-300">{t('disclaimer')}</div>
          {donate && (
            <div className="panel border-gold-500/60 p-4">
              <p className="font-display text-gold-300">{t('donate.title')}</p>
              <p className="mt-1 text-sm text-parchment-300">{t('donate.text')}</p>
              <a href={donate} target="_blank" rel="noreferrer" className="btn btn-primary mt-3">{t('donate.cta')}</a>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
