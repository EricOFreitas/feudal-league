import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { db, divisions, leagues } from '@aoe2/db';
import { seasonChampions, seasonsOf } from '@aoe2/sync';
import { asc, eq } from 'drizzle-orm';
import { Link } from '@/i18n/navigation';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { divisionName } from '@/lib/leagues';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, locale } = await params;
  const l = await db.query.leagues.findFirst({ where: eq(leagues.slug, slug) });
  const t = await getTranslations({ locale, namespace: 'seasons' });
  return { title: `${t('title')} · ${l?.name ?? slug}` };
}

export default async function SeasonsPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('seasons');
  const tl = await getTranslations('leagues');
  const tn = await getTranslations('nav');
  const td = await getTranslations('division');

  const league = await db.query.leagues.findFirst({ where: eq(leagues.slug, slug) });
  if (!league || league.status === 'archived') notFound();
  const leagueTitle = league.isGlobal ? tl('global') : league.name;
  const divs = await db.query.divisions.findMany({ where: eq(divisions.leagueId, league.id), orderBy: [asc(divisions.sort)] });
  const list = await seasonsOf(league.id);
  // campeões só das encerradas
  const champs = new Map(await Promise.all(
    list.filter((s) => s.season.endedAt).map(async (s) => [s.season.id, await seasonChampions(s.season.id)] as const),
  ));
  const dshort = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric', year: 'numeric' });

  return (
    <div>
      <Breadcrumbs items={[{ label: tn('leagues'), href: '/leagues' }, { label: leagueTitle, href: `/leagues/${league.slug}` }, { label: tn('seasons') }]} />
      <div className="space-y-8">
        <header className="panel corners p-6">
          <div className="relative z-[1]">
            <p className="kicker"><Link href={`/leagues/${league.slug}`} className="!text-gold-600 hover:!text-gold-300">{leagueTitle}</Link></p>
            <h1 className="text-3xl leading-tight font-semibold text-gold-300 sm:text-4xl">{t('title')}</h1>
            <p className="mt-2 max-w-2xl text-parchment-200">{t('lead')}</p>
          </div>
        </header>

        {list.length === 0 ? (
          <p className="italic text-parchment-400">{t('empty')}</p>
        ) : (
          <ul className="space-y-4">
            {list.map(({ season, members, matches }) => {
              const ended = season.endedAt;
              const cm = champs.get(season.id);
              const line = divs.filter((d) => cm?.has(d.id)).map((d) => `${divisionName(d, td)}: ${cm!.get(d.id)}`).join(' · ');
              return (
                <li key={season.id}>
                  <Link href={`/leagues/${league.slug}/seasons/${season.number}`} className="panel block p-5 hover:!border-gold-500 hover:!no-underline">
                    <div className="relative z-[1]">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <h2 className="font-display text-xl text-gold-300">
                          {t('season', { n: season.number })}
                          {!ended && <span className="tag ml-3 !border-moss-500 !text-moss-500 align-middle">{t('current')}</span>}
                        </h2>
                        <span className="font-display text-sm tabular-nums text-parchment-300">
                          {ended ? t('period', { from: dshort.format(season.startedAt), to: dshort.format(ended) }) : `${dshort.format(season.startedAt)} – ${t('ongoing')}`}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-parchment-300">
                        {t('players', { count: members })} · {t('matches', { count: matches })}
                      </p>
                      {ended && line && (
                        <p className="mt-3 flex items-start gap-2 text-sm text-parchment-100">
                          <Trophy className="mt-0.5 h-4 w-4 flex-none text-gold-400" />
                          <span><span className="text-parchment-400">{t('champions')} · </span>{line}</span>
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
