import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { canManageTournament, tournamentBySlug, tournamentImageVersion, tournamentOrganizersOf } from '@aoe2/sync';
import { addOrganizerAction, removeOrganizerAction } from '../../actions';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { redirect } from '@/i18n/navigation';
import { getSession } from '@/lib/session';
import { TournamentForm } from '../../new/form';
import { toBrasiliaLocalInput } from '@/lib/format';

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ org?: string; id?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tournaments.new' });
  return { title: t('editTitle') };
}

export default async function EditTournamentPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const flash = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('tournaments');
  const tn = await getTranslations('nav');
  const tour = await tournamentBySlug(slug);
  if (!tour || tour.status === 'cancelled') notFound();
  const session = await getSession();
  if (!session || !(await canManageTournament(tour, session)) || tour.status === 'finished') redirect({ href: `/tournaments/${slug}`, locale });
  const isMainOwner = tour.ownerUserId === session!.uid;
  const organizers = isMainOwner ? await tournamentOrganizersOf(tour.id) : [];
  const field = 'w-full rounded border border-gold-700/60 bg-stone-950/60 px-3 py-2 text-parchment-50';

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
            startsAt: toBrasiliaLocalInput(tour.startsAt), prize: tour.prize ?? '', groupCount: tour.groupCount, advancePerGroup: tour.advancePerGroup,
            groupBestOf: tour.groupBestOf, groupPlayAll: tour.groupPlayAll, maxPeakRating: tour.maxPeakRating, minGames: tour.minGames, minRecentGames: tour.minRecentGames,
          }}
        />
      </div>
      {isMainOwner && (
        <div className="panel space-y-3 p-6">
          <h2 className="font-display text-xl text-gold-300">{t('organizers.title')}</h2>
          <p className="text-sm text-parchment-300">{t('organizers.hint')}</p>
          {flash.org === 'added' && <p className="text-sm text-moss-500">{t('organizers.added')}</p>}
          {flash.org === 'missing' && <p className="text-sm text-crimson-500">{t('organizers.missing', { id: flash.id ?? '' })}</p>}
          {organizers.length > 0 && (
            <ul className="divide-y divide-gold-700/30 text-sm">
              {organizers.map((o) => (
                <li key={o.profileId} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-parchment-50">{o.alias} <span className="text-parchment-400">#{o.profileId}</span></span>
                  <form action={removeOrganizerAction}>
                    <input type="hidden" name="locale" value={locale} /><input type="hidden" name="tournamentId" value={tour.id} /><input type="hidden" name="profileId" value={o.profileId} />
                    <button type="submit" className="cursor-pointer text-xs text-parchment-400 hover:text-crimson-500">{t('organizers.remove')}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={addOrganizerAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="locale" value={locale} /><input type="hidden" name="tournamentId" value={tour.id} />
            <label className="min-w-0 flex-1"><span className="block text-sm text-parchment-300">{t('organizers.profileId')}</span><input name="profileId" type="number" min={1} required className={field} /></label>
            <button type="submit" className="btn btn-ghost">{t('organizers.add')}</button>
          </form>
        </div>
      )}
    </div>
  );
}
