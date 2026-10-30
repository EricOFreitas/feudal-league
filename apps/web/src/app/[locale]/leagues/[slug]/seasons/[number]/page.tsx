import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { db, leagueMembers, leagues, seasons } from '@aoe2/db';
import { seasonSummary, type RankedRow } from '@aoe2/sync';
import { and, eq, isNull } from 'drizzle-orm';
import { Link } from '@/i18n/navigation';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { DivisionMark } from '@/components/division-mark';
import { Flag } from '@/components/flag';
import { divisionName, sessionPlayer } from '@/lib/leagues';

type Props = { params: Promise<{ locale: string; slug: string; number: string }> };

/** Pódio em ordem visual: 2º, 1º, 3º. Classes literais pro Tailwind enxergar. */
const STEPS = [
  { idx: 1, h: 'h-12', num: 'II', bg: 'bg-stone-700/40', border: 'border-gold-700', numColor: 'text-parchment-300', name: 'text-sm', flag: 'text-xl' },
  { idx: 0, h: 'h-[4.5rem]', num: 'I', bg: 'bg-gold-600/35', border: 'border-gold-500', numColor: 'text-gold-300', name: 'text-base', flag: 'text-3xl' },
  { idx: 2, h: 'h-8', num: 'III', bg: 'bg-stone-700/25', border: 'border-gold-700/70', numColor: 'text-parchment-400', name: 'text-sm', flag: 'text-xl' },
] as const;

async function load(slug: string, numberParam: string) {
  const n = Number(numberParam);
  if (!Number.isInteger(n) || n < 1 || n > 32767) return null;
  const league = await db.query.leagues.findFirst({ where: eq(leagues.slug, slug) });
  if (!league || league.status === 'archived') return null;
  const season = await db.query.seasons.findFirst({ where: and(eq(seasons.leagueId, league.id), eq(seasons.number, n)) });
  if (!season) return null;
  return { league, season };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, number, locale } = await params;
  const found = await load(slug, number);
  if (!found) return {};
  const t = await getTranslations({ locale, namespace: 'seasons' });
  return { title: `${t('season', { n: found.season.number })} · ${found.league.name}` };
}

export default async function SeasonPage({ params }: Props) {
  const { locale, slug, number } = await params;
  setRequestLocale(locale);
  const found = await load(slug, number);
  if (!found) notFound();
  const { league, season } = found;
  const t = await getTranslations('seasons');
  const tx = await getTranslations('seasons.detail');
  const tl = await getTranslations('leagues');
  const tn = await getTranslations('nav');
  const td = await getTranslations('division');

  const leagueTitle = league.isGlobal ? tl('global') : league.name;
  const ended = season.endedAt != null;
  const summary = (await seasonSummary(season.id))!;
  const nf = new Intl.NumberFormat(locale);
  const dshort = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric', year: 'numeric' });
  const fmtRange = (d: { ratingMin: number; ratingMax: number | null }) => (d.ratingMax == null ? tl('rangeOpen', { min: d.ratingMin }) : tl('range', { min: d.ratingMin, max: d.ratingMax }));

  /* ── "Sua temporada" ── */
  const { player } = await sessionPlayer();
  let mine: { row: RankedRow; total: number; divName: string; sort: number } | null = null;
  for (const d of summary.divisions) {
    const row = d.rows.find((r) => r.playerId === player?.id);
    if (row) mine = { row, total: d.rows.length, divName: divisionName(d.division, td), sort: d.division.sort };
  }
  let move: string | null = null;
  if (mine && player) {
    const next = await db.query.seasons.findFirst({ where: and(eq(seasons.leagueId, league.id), eq(seasons.number, season.number + 1)) });
    const nm = next
      ? await db.query.leagueMembers.findFirst({ where: and(eq(leagueMembers.seasonId, next.id), eq(leagueMembers.playerId, player.id), isNull(leagueMembers.leftAt)), with: { division: true } })
      : null;
    if (next && nm) {
      const name = divisionName(nm.division, td);
      const key = nm.division.sort > mine.sort ? 'up' : nm.division.sort < mine.sort ? 'down' : 'same';
      move = tx(key, { division: name, n: next.number });
    }
  }

  return (
    <div>
      <Breadcrumbs items={[
        { label: tn('leagues'), href: '/leagues' },
        { label: leagueTitle, href: `/leagues/${league.slug}` },
        { label: tn('seasons'), href: `/leagues/${league.slug}/seasons` },
        { label: t('season', { n: season.number }) },
      ]} />
      <div className="space-y-10">
        <header className="panel corners p-6">
          <div className="relative z-[1] flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0 flex-[1_1_320px]">
              <p className="kicker">
                <Link href={`/leagues/${league.slug}`} className="!text-gold-600 hover:!text-gold-300">{leagueTitle}</Link>
                <span className="normal-case tracking-normal text-parchment-400"> · {ended
                  ? tx('periodEnded', { from: dshort.format(season.startedAt), to: dshort.format(season.endedAt!) })
                  : tx('periodOpen', { from: dshort.format(season.startedAt) })}</span>
              </p>
              <h1 className="text-3xl leading-tight font-semibold text-gold-300 sm:text-4xl">{ended ? tx('titleEnded', { n: season.number }) : tx('titleOpen', { n: season.number })}</h1>
              <p className="mt-2 max-w-2xl text-parchment-200">{ended ? tx('leadEnded') : tx('leadOpen')}</p>
            </div>
            <dl className="flex flex-wrap gap-6">
              {([['players', summary.totals.members], ['matches', summary.totals.matches], ['divisions', summary.totals.divisions]] as const).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-sm text-parchment-400">{tx(k)}</dt>
                  <dd className="stat-num text-2xl">{nf.format(v)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </header>

        {mine && (
          <div className="panel !border-gold-500 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="relative z-[1] flex items-center gap-3">
              <Flag code={mine.row.country} className="text-2xl" />
              <div>
                <p className="kicker">{tx('mine')}</p>
                <p className="text-parchment-50">
                  {tx(ended ? 'mineLine' : 'mineLineOpen', { name: mine.row.alias, pos: mine.row.pos, total: nf.format(mine.total), division: mine.divName, points: mine.row.points, wins: mine.row.wins, losses: mine.row.losses })}
                </p>
              </div>
            </div>
            {move && <p className="relative z-[1] text-sm text-parchment-300">{move}</p>}
          </div>
        )}

        <section>
          <div className="rule mb-5"><span className="kicker">{tx('podium')}</span></div>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(max(280px,calc((100%-2rem)/3)),1fr))]">
            {summary.divisions.map(({ division, rows }) => (
              <article key={division.id} className="panel corners p-5">
                <div className="relative z-[1]">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-xl text-gold-300">
                      <DivisionMark nameKey={division.nameKey} className="h-[22px] w-[22px] text-gold-400" />
                      {divisionName(division, td)}
                    </h2>
                    <span className="font-display text-sm tabular-nums text-parchment-300">{fmtRange(division)} · {nf.format(rows.length)}</span>
                  </div>

                  {rows.length === 0 ? (
                    <p className="mt-4 italic text-parchment-400">{tx('nobody')}</p>
                  ) : (
                    <>
                      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-end gap-1.5">
                        {STEPS.map((s) => {
                          const r = rows[s.idx];
                          if (!r) return <div key={s.idx} />;
                          return (
                            <div key={s.idx} className="flex min-w-0 flex-col items-center gap-1.5 text-center">
                              <Flag code={r.country} className={`${s.flag} leading-none`} />
                              <Link href={`/players/${r.profileId}`} className={`max-w-full font-display leading-tight [overflow-wrap:anywhere] ${s.name}`}>{r.alias}</Link>
                              <span className="text-[0.78rem] text-parchment-400">{tx('pts', { points: r.points, wins: r.wins, losses: r.losses })}</span>
                              <div className={`flex w-full items-start justify-center rounded-t-[3px] border border-b-0 pt-1.5 font-display tabular-nums ${s.h} ${s.bg} ${s.border} ${s.numColor}`}>{s.num}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="h-0.5 bg-gradient-to-r from-transparent via-gold-600 to-transparent" />

                      <details className="mt-4 text-sm">
                        <summary className="cursor-pointer font-display text-[0.72rem] tracking-[0.15em] text-gold-400 uppercase">{tx('fullTable')}</summary>
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full text-left tabular-nums">
                            <thead>
                              <tr className="border-b border-gold-700/60 text-parchment-400">
                                <th className="py-1.5 pr-2 font-normal">{tx('colPos')}</th>
                                <th className="py-1.5 pr-2 font-normal">{tx('colPlayer')}</th>
                                <th className="py-1.5 pr-2 text-right font-normal">{tx('colRating')}</th>
                                <th className="py-1.5 pr-2 text-right font-normal">{tx('colWins')}</th>
                                <th className="py-1.5 pr-2 text-right font-normal">{tx('colLosses')}</th>
                                <th className="py-1.5 text-right font-normal">{tx('colPoints')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((r) => (
                                <tr key={r.playerId} className={`border-b border-gold-700/20 ${r.playerId === player?.id ? 'bg-gold-700/25' : ''}`}>
                                  <td className="py-1.5 pr-2 text-parchment-400">{r.pos}</td>
                                  <td className="max-w-[10rem] truncate py-1.5 pr-2"><Flag code={r.country} /> <Link href={`/players/${r.profileId}`}>{r.alias}</Link></td>
                                  <td className="py-1.5 pr-2 text-right text-parchment-300">{r.placementRating}</td>
                                  <td className="py-1.5 pr-2 text-right">{r.wins}</td>
                                  <td className="py-1.5 pr-2 text-right">{r.losses}</td>
                                  <td className="py-1.5 text-right font-semibold text-gold-300">{r.points}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
