import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Trophy, Users } from 'lucide-react';
import { listTournaments } from '@aoe2/sync';
import { Link } from '@/i18n/navigation';
import { getSession } from '@/lib/session';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tournaments' });
  return { title: t('title') };
}

export default async function TournamentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('tournaments');
  const session = await getSession();
  const list = await listTournaments();
  const dt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="kicker">{t('title')}</p><h1 className="text-3xl font-semibold text-gold-300 sm:text-4xl">{t('title')}</h1><p className="mt-2 max-w-2xl text-parchment-200">{t('intro')}</p></div>
        {session ? <Link href="/tournaments/new" className="btn btn-primary">{t('create')}</Link> : <p className="text-sm text-parchment-400">{t('loginToCreate')}</p>}
      </header>

      {list.length === 0 ? <p className="italic text-parchment-400">{t('empty')}</p> : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {list.map((x) => {
            const teams = x.teams.filter((tm) => tm.status !== 'withdrawn').length;
            return (
              <li key={x.id} className="panel p-5">
                <Link href={`/tournaments/${x.slug}`} className="block no-underline hover:no-underline">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-xl text-gold-300">{x.name}</h2>
                    <span className="tag"><Trophy className="h-3.5 w-3.5" />{t(`status.${x.status as 'open' | 'groups' | 'running' | 'finished' | 'cancelled'}`)}</span>
                  </div>
                  <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-parchment-300">
                    <span>{t('format.size', { n: x.teamSize })}</span>
                    <span>· {t('format.bestOf', { n: x.bestOf })}</span>
                    {x.groupCount > 0 && <span>· {t('format.groups', { n: x.groupCount, adv: x.advancePerGroup })}</span>}
                    <span className="inline-flex items-center gap-1">· <Users className="h-3.5 w-3.5" />{x.maxTeams ? t('teamsOf', { count: teams, max: x.maxTeams }) : t('teams', { count: teams })}</span>
                  </p>
                  {x.startsAt && <p className="mt-1 text-sm text-parchment-400">{t('startsAt', { date: dt.format(x.startsAt) })}</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
