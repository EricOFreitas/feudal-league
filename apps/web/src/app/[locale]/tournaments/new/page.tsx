import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { getSession } from '@/lib/session';
import { NewTournamentForm } from './form';

export default async function NewTournamentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('tournaments');
  const tn = await getTranslations('nav');
  const session = await getSession();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumbs items={[{ label: tn('tournaments'), href: '/tournaments' }, { label: tn('newTournament') }]} />
      <header><p className="kicker">{t('title')}</p><h1 className="text-3xl font-semibold text-gold-300">{t('new.title')}</h1></header>
      {session ? <div className="panel p-6"><NewTournamentForm /></div> : (
        <div className="panel p-6 text-parchment-200">{t('loginToCreate')} <a href={`/auth/steam?next=/${locale}/tournaments/new`} className="btn btn-ghost ml-2">Steam</a></div>
      )}
    </div>
  );
}
