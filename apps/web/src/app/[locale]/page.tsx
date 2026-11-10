import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PODIUM_MIN_GAMES, globalHome, lastPodium, monthProgress, seasonMonth, tournamentStatusKey, type HomePeriod } from '@aoe2/sync';
import { Link } from '@/i18n/navigation';
import { Flag } from '@/components/flag';
import { MEDAL_COLORS } from '@/components/medal';
import { divisionName, sessionPlayer } from '@/lib/leagues';
import { monthNames } from '@/lib/format';

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ period?: string }> };

const UP = '#8fbf6a';
const DOWN = '#d9785e';
const FLAT = '#7a6a52';
const DIVISION_COLORS = ['#4a3a26', '#6b5128', '#8a6424', '#b8893a', '#d4af5a', '#f0dca2'];
const smallHead = 'font-display text-[0.8rem] font-normal tracking-[0.2em] text-gold-500 uppercase';
const playerLink = 'flex min-w-0 items-center text-parchment-50 hover:text-gold-300 hover:no-underline';
const nameCls = 'truncate font-display text-[0.95rem]';
const card = 'rounded-[3px] border border-[#3a2c1c] bg-[#1a140f]';

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 after:h-px after:flex-1 after:bg-[linear-gradient(90deg,#8a6424,transparent)] after:content-['']">
      <h2 className={smallHead}>{children}</h2>
    </div>
  );
}

export default async function Home({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { period: rawPeriod } = await searchParams;
  const period: HomePeriod = rawPeriod === 'month' ? 'month' : 'week';

  const { player } = await sessionPlayer();
  const [home, podium] = await Promise.all([globalHome(period, player?.id ?? null), lastPodium()]);
  if (!home) notFound();

  const t = await getTranslations('homeGlobal');
  const tp = await getTranslations('podium.home');
  const td = await getTranslations('division');
  const tl = await getTranslations('leagues');
  const tt = await getTranslations('tournaments');

  const nf = new Intl.NumberFormat(locale);
  const { day, total: daysInMonth } = monthProgress();
  const names = monthNames(home.month.year, home.month.month, locale);
  const end = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(home.month.year, home.month.month, 0)));
  const divName = (id: number) => { const d = home.divById.get(id); return d ? divisionName(d, td) : '?'; };
  const periodShort = t(period === 'week' ? 'me.periodWeek' : 'me.periodMonth');
  const periodLabel = t(period === 'week' ? 'movers.last7' : 'movers.last30');
  const signed = (n: number) => (n > 0 ? `+${nf.format(n)}` : `−${nf.format(-n)}`);
  const arrow = (d: number) => (d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : '—');
  const arrowColor = (d: number) => (d > 0 ? UP : d < 0 ? DOWN : FLAT);
  const me = home.me;
  const podiumMonth = podium && seasonMonth(podium.season);
  const tabs = [['week', t('ranking.week')], ['month', t('ranking.month')]] as const;

  return (
    <div className="flex flex-col gap-8 [container-type:inline-size]">
      {/* ── o mês ── */}
      <section className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
        <div className="min-w-0 flex-[1_1_26rem]">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2 font-display text-[0.72rem] tracking-[0.2em] text-gold-500 uppercase">
            <span>{tp('kicker', { month: names.longCap, year: home.month.year })}</span>
            <span className="rounded-[2px] border border-gold-600 px-2 py-[0.15rem] tracking-[0.12em] text-gold-300">{tp('day', { day, total: daysInMonth })}</span>
          </p>
          <h1 className="mt-2 text-[clamp(2rem,5cqi,2.75rem)] leading-[1.1] font-semibold text-gold-300 [text-wrap:balance]">{tp('title', { month: names.long })}</h1>
          <p className="mt-3 max-w-[38rem] text-parchment-200 [text-wrap:pretty]">{tp('lead', { end })}</p>
          <p className="mt-[0.4rem] max-w-[38rem] text-[0.92rem] text-parchment-400 [text-wrap:pretty]">
            {tp('rulesShort', { min: PODIUM_MIN_GAMES })}{' '}
            <Link href="/rules#leagues" className="text-parchment-300 underline decoration-gold-700 hover:text-gold-300">{tp('rulesLink')}</Link>
          </p>
          <div className="mt-4 flex max-w-[26rem] flex-col gap-[0.35rem]">
            <div className="h-1 overflow-hidden rounded-[2px] border border-[#3a2c1c] bg-stone-950">
              <div className="h-full bg-gold-400" style={{ width: `${Math.round((day / daysInMonth) * 100)}%` }} />
            </div>
            <p className="text-[0.85rem] text-parchment-400">{tp('endsIn', { days: daysInMonth - day, end })}</p>
          </div>
        </div>
        <form action={`/${locale}/search`} method="get" className="flex max-w-[26rem] flex-[1_1_20rem] flex-col gap-2">
          <label htmlFor="q" className="font-display text-[0.72rem] tracking-[0.2em] text-gold-500 uppercase">{t('search.label')}</label>
          <div className="flex gap-2">
            <input id="q" name="q" className="input min-w-0 flex-1 px-[0.9rem] py-[0.6rem]" placeholder={t('search.placeholder')} autoComplete="off" required maxLength={120} />
            <button type="submit" className="btn shrink-0 px-4 py-[0.6rem] text-[0.8rem]">{t('search.button')}</button>
          </div>
        </form>
      </section>

      {/* ── você ── */}
      {me && (
        <section className="relative grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-px overflow-hidden rounded border border-gold-600 bg-gold-700">
          <div className="bg-stone-800 px-5 py-4">
            <p className="font-display text-[0.68rem] tracking-[0.2em] text-gold-500 uppercase">{t('me.you', { division: divisionName(me.division, td) })}</p>
            <p className="mt-1 flex items-center gap-2 font-display text-xl text-parchment-50"><Flag code={me.country} />{me.alias}</p>
          </div>
          <div className="bg-stone-800 px-5 py-4">
            <p className="font-display text-[0.68rem] tracking-[0.2em] text-gold-500 uppercase">{t('me.inDivision')}</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-2xl text-gold-300 tabular-nums">#{nf.format(me.divisionPos)}</span>
              {me.divisionDelta != null && <span className="text-[0.95rem]" style={{ color: arrowColor(me.divisionDelta) }}>{arrow(me.divisionDelta)} {periodShort}</span>}
            </p>
          </div>
          <div className="bg-stone-800 px-5 py-4">
            <p className="font-display text-[0.68rem] tracking-[0.2em] text-gold-500 uppercase">{t('me.global')}</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-2xl text-gold-300 tabular-nums">#{nf.format(me.globalPos)}</span>
              <span className="text-[0.95rem] text-parchment-300">{t('me.of', { total: nf.format(home.total) })}</span>
            </p>
          </div>
          {me.next && (
            <div className="flex flex-col justify-between gap-2 bg-stone-800 px-5 py-4">
              <p className="text-[0.95rem] text-parchment-200">
                {me.next.ratingMin > me.rating
                  ? t.rich('me.missing', { n: nf.format(me.next.ratingMin - me.rating), division: divisionName(me.next, td), b: (c) => <strong className="font-semibold text-gold-300">{c}</strong> })
                  : t('me.ready', { division: divisionName(me.next, td) })}
              </p>
              <div className="h-1.5 overflow-hidden rounded-[3px] border border-gold-700 bg-stone-950">
                <div className="h-full bg-[linear-gradient(90deg,#8a6424,#e9cf8a)]" style={{ width: `${Math.min(100, Math.max(0, Math.round(((me.rating - me.division.ratingMin) / (me.next.ratingMin - me.division.ratingMin)) * 100)))}%` }} />
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── divisões ── */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 className={smallHead}>{t('divisions.title', { total: nf.format(home.total), count: home.divisions.length })}</h2>
          {home.moved.length > 0 && <p className="text-[0.9rem] text-parchment-300">{t('divisions.moved', { up: home.movedUp, down: home.movedDown })}</p>}
        </div>
        <div className="flex h-3.5 gap-0.5">
          {home.divisions.map((d, i) => (
            <div key={d.division.id} title={divisionName(d.division, td)} className="rounded-[2px]" style={{ flex: `${d.members} 1 0`, background: DIVISION_COLORS[i] ?? DIVISION_COLORS[0] }} />
          ))}
        </div>
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2">
          {home.divisions.map((d, i) => (
            <li key={d.division.id}>
              <Link href={`/leagues/${home.league.slug}?div=${d.division.id}`} className={`${card} flex flex-col gap-[0.1rem] px-3 py-[0.6rem] hover:border-gold-600 hover:no-underline`}>
                <span className="flex items-center gap-[0.4rem] font-display text-[0.9rem] text-parchment-50">
                  <span className="h-2 w-2 rounded-[1px]" style={{ background: DIVISION_COLORS[i] ?? DIVISION_COLORS[0] }} />{divisionName(d.division, td)}
                </span>
                <span className="text-[0.85rem] text-parchment-400 tabular-nums">{d.division.ratingMax == null ? tl('rangeOpen', { min: d.division.ratingMin }) : tl('range', { min: d.division.ratingMin, max: d.division.ratingMax })}</span>
                <span className="text-[0.9rem] text-parchment-200 tabular-nums">{t('divisions.players', { count: d.members, n: nf.format(d.members) })}</span>
                {(d.up > 0 || d.down > 0) && (
                  <span className="text-[0.85rem] text-parchment-300 tabular-nums">{[d.up > 0 ? `+${d.up} ↑` : null, d.down > 0 ? `${d.down} ↓` : null].filter(Boolean).join(' · ')}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── pódio do último mês ── */}
      {podium && podiumMonth && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <h2 className="text-xl font-normal text-gold-300">{tp('lastPodium', { month: monthNames(podiumMonth.year, podiumMonth.month, locale).long })}</h2>
            <Link href={`/leagues/${home.league.slug}/seasons`} className="text-[0.9rem] text-parchment-300 hover:text-gold-300">{tp('allPast')}</Link>
          </div>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3">
            {podium.divisions.map((d) => (
              <li key={d.division.id} className={`${card} flex flex-col gap-[0.4rem] px-4 py-[0.85rem]`}>
                <p className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-[0.8rem] tracking-[0.16em] text-gold-500 uppercase">{divisionName(d.division, td)}</span>
                  <span className="text-[0.8rem] text-[#7a6a52]">{t('divisions.players', { count: d.members, n: nf.format(d.members) })}</span>
                </p>
                <ol className="flex flex-col gap-[0.3rem]">
                  {d.rows.map((r) => {
                    const c = MEDAL_COLORS[r.position - 1] ?? MEDAL_COLORS[2];
                    return (
                      <li key={r.position} className="grid grid-cols-[1.6rem_minmax(0,1fr)_auto] items-center gap-2">
                        <span className="grid h-[1.6rem] w-[1.6rem] place-items-center rounded-full border-[1.5px] font-display text-xs font-bold text-[#14100c]" style={{ borderColor: c.dark, background: c.light }}>{r.position}</span>
                        <Link href={`/players/${r.player.profileId}`} className={`${playerLink} gap-[0.4rem]`}><Flag code={r.player.country} /><span className="truncate font-display text-[0.92rem]">{r.player.alias}</span></Link>
                        <span className="text-[0.85rem] text-parchment-400 tabular-nums">{tp('pts', { points: r.points })}</span>
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── ranking e quem mais mexeu ── */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] items-start gap-6">
        <section className="panel p-5">
          <div className="relative z-[1] mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-normal text-gold-300">{t('ranking.title')}</h2>
            <div role="tablist" className="flex overflow-hidden rounded-[3px] border border-gold-700">
              {tabs.map(([key, label], i) => (
                <Link
                  key={key} role="tab" aria-selected={period === key} scroll={false} href={key === 'week' ? '/' : '/?period=month'}
                  className={`px-[0.7rem] py-[0.35rem] font-display text-[0.7rem] tracking-[0.12em] uppercase hover:no-underline ${i > 0 ? 'border-l border-gold-700' : ''} ${period === key ? 'bg-[rgba(138,100,36,0.35)] text-gold-300' : 'text-parchment-400'}`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
          <ol className="relative z-[1] flex flex-col">
            {home.ranking.map((r) => (
              <li key={r.playerId} className="grid grid-cols-[2rem_2.75rem_minmax(0,1fr)_auto_auto] items-center gap-[0.6rem] border-t border-[#3a2c1c] px-1 py-[0.45rem]">
                <span className={`text-right font-display tabular-nums ${r.pos <= 3 ? 'text-gold-300' : 'text-parchment-300'}`}>{r.pos}</span>
                <span className="text-[0.85rem] tabular-nums" style={{ color: arrowColor(r.delta) }}>{arrow(r.delta)}</span>
                <Link href={`/players/${r.profileId}`} className={`${playerLink} gap-[0.45rem]`}><Flag code={r.country} /><span className={nameCls}>{r.alias}</span></Link>
                <span className="text-[0.8rem] text-parchment-400">{divName(r.divisionId)}</span>
                <span className="min-w-12 text-right font-display text-gold-300 tabular-nums">{r.rating}</span>
              </li>
            ))}
          </ol>
          <Link href={`/leagues/${home.league.slug}`} className="relative z-[1] mt-3 inline-flex rounded-[3px] border border-gold-600 px-3 py-[0.4rem] font-display text-xs tracking-[0.06em] text-gold-300 uppercase hover:bg-[rgba(184,137,58,0.1)] hover:no-underline">
            {t('ranking.full', { total: nf.format(home.total) })}
          </Link>
        </section>

        <div className="flex flex-col gap-6">
          {([[t('movers.up'), home.risers, UP], [t('movers.down'), home.fallers, DOWN]] as const).map(([title, rows, color]) => (
            <section key={title} className="panel p-5">
              <h2 className="relative z-[1] mb-2 flex items-baseline justify-between gap-2"><span className="text-xl font-normal text-gold-300">{title}</span><span className="font-body text-[0.85rem] text-parchment-400">{periodLabel}</span></h2>
              {rows.length === 0 ? (
                <p className="relative z-[1] text-sm italic text-parchment-400">{t('movers.empty')}</p>
              ) : (
                <ol className="relative z-[1] flex flex-col">
                  {rows.map((p) => (
                    <li key={p.playerId} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-[#3a2c1c] py-[0.45rem]">
                      <Link href={`/players/${p.profileId}`} className={`${playerLink} gap-[0.45rem]`}>
                        <Flag code={p.country} />
                        <span className="flex min-w-0 flex-col leading-[1.2]"><span className={nameCls}>{p.alias}</span><span className="text-[0.8rem] text-parchment-400">{divName(p.divisionId)} · {t('movers.record', { wins: p.wins, losses: p.losses })}</span></span>
                      </Link>
                      <span className="font-display text-parchment-200 tabular-nums">{p.rating}</span>
                      <span className="min-w-[3.25rem] text-right font-semibold tabular-nums" style={{ color }}>{signed(p.delta)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
      </div>

      {/* ── trocas, destaques, torneios ── */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-6">
        {home.moved.length > 0 && (
          <section className="flex flex-col gap-2">
            <Rule>{t('changes.title')}</Rule>
            <ul className="flex flex-col">
              {home.moved.slice(0, 6).map((c) => (
                <li key={c.playerId} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-[0.6rem] border-b border-[#2a2017] py-2">
                  <span className="text-center" style={{ color: c.up ? UP : DOWN }}>{c.up ? '▲' : '▼'}</span>
                  <Link href={`/players/${c.profileId}`} className={`${playerLink} gap-[0.45rem]`}><Flag code={c.country} /><span className={nameCls}>{c.alias}</span></Link>
                  <span className="whitespace-nowrap text-[0.9rem] text-parchment-300">{divisionName(c.from, td)} → <span style={{ color: c.up ? UP : DOWN }}>{divisionName(c.to, td)}</span></span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <Rule>{t('highlights.title')}</Rule>
          <ul className="flex flex-col gap-2">
            {home.highlights.streak && (
              <li className={`${card} px-4 py-3`}>
                <p className="font-display text-[0.68rem] tracking-[0.2em] text-gold-500 uppercase">{t('highlights.streakLabel')}</p>
                <p className="mt-[0.2rem] flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-display text-parchment-50"><Flag code={home.highlights.streak.country} /> {home.highlights.streak.alias}</span>
                  <span className="text-[0.95rem] text-parchment-200">{t('highlights.streak', { n: home.highlights.streak.streak!, division: divName(home.highlights.streak.divisionId) })}</span>
                </p>
              </li>
            )}
            {home.highlights.upset && (
              <li className={`${card} px-4 py-3`}>
                <p className="font-display text-[0.68rem] tracking-[0.2em] text-gold-500 uppercase">{t('highlights.upsetLabel')}</p>
                <p className="mt-[0.2rem] flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-display text-parchment-50"><Flag code={home.highlights.upset.player.country} /> {home.highlights.upset.player.alias}</span>
                  <span className="text-[0.95rem] text-parchment-200">{t('highlights.upset', { opponent: home.highlights.upset.opponent ?? '?', gap: nf.format(home.highlights.upset.gap) })}</span>
                </p>
              </li>
            )}
            {home.highlights.busiest && (
              <li className={`${card} px-4 py-3`}>
                <p className="font-display text-[0.68rem] tracking-[0.2em] text-gold-500 uppercase">{t('highlights.busiestLabel')}</p>
                <p className="mt-[0.2rem] flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-display text-parchment-50"><Flag code={home.highlights.busiest.player.country} /> {home.highlights.busiest.player.alias}</span>
                  <span className="text-[0.95rem] text-parchment-200">{t('highlights.busiest', { n: home.highlights.busiest.n })}</span>
                </p>
              </li>
            )}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <Rule>{t('tournaments.title')}</Rule>
          {home.tournaments.length === 0 ? (
            <p className="text-[0.95rem] text-parchment-400">{t('tournaments.empty')} <Link href="/tournaments" className="text-parchment-300 underline decoration-gold-700 hover:text-gold-300">{t('tournaments.all')}</Link></p>
          ) : (
            <ul className="flex flex-col gap-2">
              {home.tournaments.map((x) => (
                <li key={x.id}>
                  <Link href={`/tournaments/${x.slug}`} className={`${card} flex flex-col gap-[0.15rem] px-4 py-3 hover:border-gold-600 hover:no-underline`}>
                    <span className="flex justify-between gap-2"><span className="font-display text-parchment-50">{x.name}</span><span className="whitespace-nowrap text-[0.8rem]" style={{ color: tournamentStatusKey(x) === 'open' ? UP : '#e9cf8a' }}>{tt(`status.${tournamentStatusKey(x) as 'open'}`)}</span></span>
                    <span className="text-[0.9rem] text-parchment-400">{tt('format.size', { n: x.teamSize })} · {tt('format.bestOf', { n: x.bestOf })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── liga própria ── */}
      <section className="flex flex-wrap items-center justify-between gap-4 border-t border-[#3a2c1c] pt-6">
        <p className="max-w-[40rem] text-parchment-300 [text-wrap:pretty]">{t('cta.text')}</p>
        <Link href="/leagues/new" className="rounded-[3px] border border-gold-600 px-[1.1rem] py-[0.6rem] font-display text-[0.85rem] tracking-[0.06em] text-gold-300 uppercase hover:bg-[rgba(184,137,58,0.1)] hover:no-underline">{t('cta.button')}</Link>
      </section>
    </div>
  );
}
