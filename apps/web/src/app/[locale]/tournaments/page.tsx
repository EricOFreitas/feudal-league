import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Search, Users } from 'lucide-react';
import { db, leagues } from '@aoe2/db';
import { inArray } from 'drizzle-orm';
import { listTournaments, myTournaments } from '@aoe2/sync';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { Link } from '@/i18n/navigation';
import { sessionPlayer } from '@/lib/leagues';

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string; f?: string; more?: string }> };
type Status = 'open' | 'groups' | 'running' | 'finished' | 'cancelled';

const FILTERS = ['active', 'running', 'open', 'finished'] as const;
type Filter = (typeof FILTERS)[number];
const IN_FILTER: Record<Filter, (s: string) => boolean> = {
  active: (s) => s !== 'finished',
  running: (s) => s === 'groups' || s === 'running',
  open: (s) => s === 'open',
  finished: (s) => s === 'finished',
};
/** Cor da borda esquerda e do texto do status. */
const TONE: Record<string, { border: string; text: string }> & { finished: { border: string; text: string } } = {
  open: { border: 'border-l-moss-500', text: 'border-moss-500 text-moss-500' },
  groups: { border: 'border-l-gold-400', text: 'border-gold-400 text-gold-300' },
  running: { border: 'border-l-gold-400', text: 'border-gold-400 text-gold-300' },
  finished: { border: 'border-l-parchment-400', text: 'border-parchment-400 text-parchment-400' },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tournaments' });
  return { title: t('title') };
}

export default async function TournamentsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('tournaments');
  const tn = await getTranslations('nav');
  const { session, player } = await sessionPlayer();
  const all = await listTournaments();
  const q = (sp.q ?? '').trim().slice(0, 60);
  const f: Filter = (FILTERS as readonly string[]).includes(sp.f ?? '') ? (sp.f as Filter) : 'active';
  const dt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  const leagueIds = [...new Set(all.map((x) => x.leagueId).filter((id): id is number => id != null))];
  const leagueNames = new Map((leagueIds.length ? await db.select({ id: leagues.id, name: leagues.name }).from(leagues).where(inArray(leagues.id, leagueIds)) : []).map((l) => [l.id, l.name]));
  const base = all.filter((x) => !q || `${x.name} ${x.leagueId ? leagueNames.get(x.leagueId) ?? '' : ''}`.toLowerCase().includes(q.toLowerCase()));
  const list = base.filter((x) => IN_FILTER[f](x.status));
  const shown = sp.more ? list : list.slice(0, 6);
  const mine = player && !q ? await myTournaments(player.id) : [];
  const mineMap = new Map(mine.map((m) => [m.tournamentId, m]));
  const mineCards = all.filter((x) => mineMap.has(x.id) && x.status !== 'finished');
  const href = (filter: Filter) => ({ pathname: '/tournaments' as const, query: { ...(q ? { q } : {}), f: filter } });

  return (
    <div className="space-y-8">
      <Breadcrumbs items={[{ label: tn('tournaments') }]} />

      <section className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-semibold text-gold-300">{t('title')}</h1>
        <p className="mt-3 text-parchment-200">{t('listIntro')}</p>
        <div className="mt-4">
          {session ? <Link href="/tournaments/new" className="btn btn-primary">{t('create')}</Link> : <p className="text-sm text-parchment-400">{t('loginToCreate')}</p>}
        </div>
      </section>

      <div className="panel p-4 sm:px-5">
        <div className="relative z-[1] space-y-3.5">
          <form action={`/${locale}/tournaments`} method="get" className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="f" value={f} />
            <div className="relative min-w-0 flex-1 basis-56">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-parchment-400" />
              <input name="q" defaultValue={q} placeholder={t('searchPlaceholder')} autoComplete="off" maxLength={60} className="input !py-2.5 !pl-10" />
            </div>
            <button type="submit" className="btn btn-ghost">{t('searchButton')}</button>
          </form>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((k) => {
              const on = k === f;
              return (
                <Link key={k} href={href(k)} className={`inline-flex items-center gap-1.5 rounded-[3px] border px-3 py-1.5 font-display text-[0.72rem] uppercase tracking-[0.15em] no-underline hover:no-underline hover:border-gold-500 ${on ? 'border-gold-500 bg-gold-600/30 text-gold-300' : 'border-gold-700 text-parchment-400'}`}>
                  {t(`filters.${k}`)}<span className="font-body text-[0.85rem] normal-case tracking-normal text-parchment-400">{base.filter((x) => IN_FILTER[k](x.status)).length}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {mineCards.length > 0 && (
        <section>
          <div className="rule mb-5"><span className="kicker">{t('mine.title')}</span></div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {mineCards.map((x) => {
              const m = mineMap.get(x.id)!;
              const tone = TONE[x.status] ?? TONE.finished;
              return (
                <li key={x.id} className="panel !border-gold-500 p-4">
                  <Link href={`/tournaments/${x.slug}`} className="relative z-[1] block no-underline hover:no-underline">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 font-display text-xl text-gold-300">{x.name}</h3>
                      <span className={`tag flex-none ${tone.text}`}>{t(`status.${x.status as Status}`)}</span>
                    </div>
                    <p className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                      <span className="text-parchment-200">{m.nextOpponent ? t('mine.next', { name: m.nextOpponent }) : t('mine.registered')}</span>
                      {x.startsAt && <span className="text-gold-300">{dt.format(x.startsAt)}</span>}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <div className="rule mb-5"><span className="kicker">{t(`filters.${f}`)}</span></div>
        {list.length === 0 ? <p className="italic text-parchment-400">{all.length === 0 ? t('empty') : t('noMatch')}</p> : (
          <ul className="flex flex-col gap-2">
            {shown.map((x) => {
              const teams = x.teams.filter((tm) => tm.status !== 'withdrawn').length;
              const tone = TONE[x.status] ?? TONE.finished;
              return (
                <li key={x.id} className={`panel !border-l-[3px] ${tone.border}`}>
                  <Link href={`/tournaments/${x.slug}`} className="relative z-[1] flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 no-underline hover:bg-gold-500/5 hover:no-underline">
                    <div className="flex min-w-0 flex-1 basis-72 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-[1.1rem] text-parchment-50">{x.name}</span>
                        {mineMap.has(x.id) && <span className="tag !border-moss-500 text-parchment-50">{t('joined')}</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 text-sm text-parchment-300">
                        <span>{x.groupCount > 0 ? t('format.groups', { n: x.groupCount, adv: x.advancePerGroup }) : t('format.knockout')}</span>
                        <span>· {t('format.size', { n: x.teamSize })} · {t('format.bestOf', { n: x.bestOf })}</span>
                        <span className="inline-flex items-center gap-1">· <Users className="h-3.5 w-3.5" />{x.maxTeams ? t('teamsOf', { count: teams, max: x.maxTeams }) : t('teams', { count: teams })}</span>
                      </div>
                    </div>
                    <div className="flex flex-none flex-col items-end gap-1 text-right">
                      <span className={`tag ${tone.text}`}>{t(`status.${x.status as Status}`)}</span>
                      {x.startsAt && <span className="text-xs text-parchment-400">{t('startsAt', { date: dt.format(x.startsAt) })}</span>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {list.length > shown.length && (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Link href={{ pathname: '/tournaments' as const, query: { ...(q ? { q } : {}), f, more: '1' } }} className="btn btn-ghost !text-xs">{t('more')}</Link>
            <span className="text-sm text-parchment-400">{t('showing', { n: shown.length, total: list.length })}</span>
          </div>
        )}
      </section>
    </div>
  );
}
