import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { tournamentBySlug, tournamentImageVersion } from '@aoe2/sync';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { redirect } from '@/i18n/navigation';
import { getSession } from '@/lib/session';
import { TournamentForm } from '../../new/form';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tournaments.new' });
  return { title: t('editTitle') };
}

/** Data no formato do <input type="datetime-local">, no mesmo fuso em que a ação de criar interpreta o valor. */
function localInput(d: Date | null) {
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default async function EditTournamentPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('tournaments');
  const tn = await getTranslations('nav');
  const tour = await tournamentBySlug(slug);
  if (!tour || tour.status === 'cancelled') notFound();
  const session = await getSession();
  if (!session || tour.ownerUserId !== session.uid || tour.status === 'finished') redirect({ href: `/tournaments/${slug}`, locale });

  const activeTeams = tour.teams.filter((x) => x.status !== 'withdrawn').length;
  const imageV = await tournamentImageVersion(tour.id);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumbs items={[{ label: tn('tournaments'), href: '/tournaments' }, { label: tour.name, href: `/tournaments/${slug}` }, { label: t('new.editTitle') }]} />
      <header><p className="kicker">{tour.name}</p><h1 className="text-3xl font-semibold text-gold-300">{t('new.editTitle')}</h1></header>
      <div className="panel p-6">
        <TournamentForm
          mode="edit" tournamentId={tour.id} slug={slug}
          formatLocked={tour.status !== 'open'} sizeLocked={activeTeams > 0}
          imageUrl={imageV ? `/api/tournaments/${tour.id}/image?v=${imageV}` : null}
          initial={{
            name: tour.name, description: tour.description ?? '', organizerName: tour.organizerName ?? '', organizerUrl: tour.organizerUrl ?? '', registrationClosed: tour.registrationClosed, teamSize: tour.teamSize, maxTeams: tour.maxTeams, bestOf: tour.bestOf, finalBestOf: tour.finalBestOf,
            startsAt: localInput(tour.startsAt), prize: tour.prize ?? '', groupCount: tour.groupCount, advancePerGroup: tour.advancePerGroup,
            groupBestOf: tour.groupBestOf, groupPlayAll: tour.groupPlayAll, maxPeakRating: tour.maxPeakRating, minGames: tour.minGames, minRecentGames: tour.minRecentGames,
          }}
        />
      </div>
    </div>
  );
}
