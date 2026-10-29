import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Globe, Plus, Users } from 'lucide-react';
import { listLeagues } from '@aoe2/sync';
import { Link } from '@/i18n/navigation';
import { getSession } from '@/lib/session';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'leagues' });
  return { title: t('title') };
}

export default async function LeaguesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('leagues');
  const session = await getSession();
  const rows = await listLeagues();
  const global = rows.find((r) => r.league.isGlobal);
  const others = rows.filter((r) => !r.league.isGlobal);

  return (
    <div className="space-y-10">
      <section className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-semibold text-gold-300">{t('title')}</h1>
        <p className="mt-3 text-parchment-200">{t('intro')}</p>
      </section>

      {global && (
        <Link href={`/leagues/${global.league.slug}`} className="panel corners block p-6 no-underline hover:no-underline">
          <div className="flex items-center gap-4">
            <Globe className="h-10 w-10 shrink-0 text-gold-400" />
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl text-gold-300">{t('global')}</h2>
              <p className="text-parchment-200">{t('globalHint')}</p>
            </div>
            <span className="tag shrink-0"><Users className="h-3.5 w-3.5" />{t('members', { count: global.members })}</span>
          </div>
        </Link>
      )}

      <section>
        <div className="rule mb-5"><span className="kicker">{t('create')}</span></div>
        <div className="panel flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-parchment-200">{session ? t('createHint') : t('loginToCreate')}</p>
          {session ? (
            <Link href="/leagues/new" className="btn shrink-0"><Plus className="h-4 w-4" />{t('create')}</Link>
          ) : (
            <a href={`/auth/steam?next=/${locale}/leagues/new`} className="btn shrink-0">{t('create')}</a>
          )}
        </div>
      </section>

      <section>
        {others.length === 0 ? (
          <p className="text-center italic text-parchment-400">{t('empty')}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {others.map(({ league, members }) => (
              <li key={league.id} className="panel p-4">
                <Link href={`/leagues/${league.slug}`} className="block no-underline hover:no-underline">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-lg text-gold-300">{league.name}</h3>
                    <span className="tag shrink-0"><Users className="h-3.5 w-3.5" />{t('members', { count: members })}</span>
                  </div>
                  {league.description && <p className="mt-1 line-clamp-2 text-sm text-parchment-300">{league.description}</p>}
                  {league.status === 'closed' && <p className="mt-2 text-xs uppercase tracking-wider text-crimson-500">{t('closed')}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
