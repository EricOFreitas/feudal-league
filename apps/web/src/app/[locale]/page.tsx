import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Search } from 'lucide-react';
import { db, players } from '@aoe2/db';
import { desc } from 'drizzle-orm';
import { Link } from '@/i18n/navigation';
import { Flag } from '@/components/flag';
import { RM_1V1 } from '@aoe2/aoe-api';

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');

  const recent = await db.query.players.findMany({ orderBy: [desc(players.createdAt)], limit: 8, with: { ratings: true } });

  return (
    <div className="space-y-12">
      <section className="relative mx-auto max-w-3xl pt-6 text-center">
        <p className="kicker mb-3">Age of Empires II: Definitive Edition</p>
        <h1 className="text-4xl font-semibold text-gold-300 sm:text-5xl">{t('title')}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-parchment-200">{t('subtitle')}</p>

        <form action={`/${locale}/search`} method="get" className="panel corners mx-auto mt-8 max-w-2xl p-5 text-left sm:p-6">
          <label htmlFor="q" className="kicker block">{t('add.title')}</label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input id="q" name="q" className="input" placeholder={t('add.placeholder')} autoComplete="off" required maxLength={120} />
            <button type="submit" className="btn shrink-0"><Search className="h-4 w-4" />{t('add.button')}</button>
          </div>
          <p className="mt-3 text-sm text-parchment-300">{t('add.hint')}</p>
          <p className="mt-1 text-sm italic text-parchment-400">{t('add.free')}</p>
        </form>
        <p className="mt-5"><Link href="/leagues" className="btn btn-ghost">{t('leaguesCta')}</Link></p>
      </section>

      <section>
        <div className="rule mb-6"><span className="kicker">{t('steps.title')}</span></div>
        <ol className="grid gap-4 sm:grid-cols-3">
          {(['one', 'two', 'three'] as const).map((k, i) => (
            <li key={k} className="panel p-5">
              <div className="stat-num text-3xl">{['I', 'II', 'III'][i]}</div>
              <h2 className="mt-2 text-xl text-gold-300">{t(`steps.${k}.title`)}</h2>
              <p className="mt-1 text-parchment-200">{t(`steps.${k}.text`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <div className="rule mb-6"><span className="kicker">{t('recent')}</span></div>
        {recent.length === 0 ? (
          <p className="text-center italic text-parchment-400">{t('empty')}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((p) => {
              const rm = p.ratings.find((r) => r.leaderboardId === RM_1V1);
              return (
                <li key={p.id} className="panel p-4">
                  <Link href={`/players/${p.profileId}`} className="flex items-center justify-between gap-3 no-underline hover:no-underline">
                    <span className="flex min-w-0 items-center gap-2">
                      <Flag code={p.country} className="text-xl" />
                      <span className="truncate font-display text-parchment-50">{p.alias}</span>
                    </span>
                    <span className="stat-num text-xl">{rm ? rm.rating : '–'}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
