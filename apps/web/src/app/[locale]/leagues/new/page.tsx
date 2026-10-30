import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { DEFAULT_DIVISIONS } from '@aoe2/sync';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { redirect } from '@/i18n/navigation';
import { getSession } from '@/lib/session';
import { NewLeagueForm } from './form';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'leagues' });
  return { title: t('new.title') };
}

export default async function NewLeaguePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session) redirect({ href: '/login', locale });
  const td = await getTranslations('division');
  const tn = await getTranslations('nav');
  const defaults = DEFAULT_DIVISIONS.map((d) => ({ nameKey: d.nameKey, name: td(d.nameKey as never), min: d.ratingMin, max: d.ratingMax }));
  return (
    <>
      <Breadcrumbs items={[{ label: tn('leagues'), href: '/leagues' }, { label: tn('newLeague') }]} />
      <NewLeagueForm locale={locale} defaults={defaults} />
    </>
  );
}
