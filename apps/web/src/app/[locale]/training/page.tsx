import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ExternalLink } from 'lucide-react';
import { CHALLENGE_MATCHES, benchmarksForLeague, challengeOf, challengeProgress, challengeTarget, findPlayerBySteamId, trainingFocusOf } from '@aoe2/sync';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ChallengeCard } from '@/components/challenge-card';
import { FocusCard } from '@/components/focus-card';
import { Link } from '@/i18n/navigation';
import { divisionName } from '@/lib/leagues';
import { getSession } from '@/lib/session';

type SiteItem = { name: string; what: string; href: string; link: string };
type ExtItem = { name: string; what: string; url: string | null };
const EXT = ['bo', 'hotkeys', 'micro', 'review', 'qol'] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'training' });
  return { title: t('title'), description: t('intro') };
}

/** "Como treinar": o que o site mede, em que ordem treinar e ferramentas de fora (docs/TREINO.md §3). Texto em messages/parts/training.*.json. */
export default async function TrainingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('training');
  const tn = await getTranslations('nav');
  const td = await getTranslations('division');
  const tch = await getTranslations('challenge');
  const site = t.raw('site.items') as SiteItem[];
  const order = t.raw('order.items') as string[];
  // foco de treino do jogador logado (T3)
  const session = await getSession();
  const player = session ? await findPlayerBySteamId(session.sid) : null;
  const mine = player ? await trainingFocusOf(player) : null;
  // desafio da semana (T4): alvo = mediana da divisão do jogador; progresso só pro logado
  const ch = challengeOf();
  const chTarget = mine?.division ? challengeTarget((await benchmarksForLeague(mine.division.leagueId)).get(mine.division.id), ch.metric) : null;
  const chProgress = player ? await challengeProgress(player.profileId, ch) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <Breadcrumbs items={[{ label: tn('training') }]} />
      <header>
        <p className="kicker">{t('kicker')}</p>
        <h1 className="text-3xl font-semibold text-gold-300 sm:text-4xl">{t('title')}</h1>
        <p className="mt-3 max-w-2xl text-lg text-parchment-200">{t('intro')}</p>
        <nav className="mt-4 flex flex-wrap gap-2 text-sm">
          <a href="#site" className="tag no-underline hover:border-gold-500 hover:no-underline">{t('site.title')}</a>
          <a href="#challenge" className="tag no-underline hover:border-gold-500 hover:no-underline">{tch('title')}</a>
          <a href="#order" className="tag no-underline hover:border-gold-500 hover:no-underline">{t('order.title')}</a>
          {EXT.map((s) => <a key={s} href={`#${s}`} className="tag no-underline hover:border-gold-500 hover:no-underline">{t(`ext.${s}.title`)}</a>)}
        </nav>
      </header>

      <section id="focus" className="scroll-mt-6">
        <div className="rule mb-5"><span className="kicker">{t('focus.title')}</span></div>
        {mine && player ? (
          <div className="space-y-3">
            <FocusCard focus={mine.focus} divisionLabel={mine.division ? divisionName(mine.division, td) : null} aboveLabel={mine.above ? divisionName(mine.above, td) : null} showEmpty />
            <p className="text-sm"><Link href={`/players/${player.profileId}`}>{t('focus.profile')} →</Link></p>
          </div>
        ) : session ? (
          <p className="text-parchment-300">{t('focus.noPlayer')} <Link href="/me">{t('focus.profile')} →</Link></p>
        ) : (
          <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-parchment-200">{t('focus.login')}</p>
            <Link href="/login" className="btn flex-none">{tn('login')}</Link>
          </div>
        )}
      </section>

      <section id="challenge" className="scroll-mt-6">
        <div className="rule mb-5"><span className="kicker">{tch('title')}</span></div>
        <ChallengeCard ch={ch} locale={locale} target={chTarget} divisionLabel={mine?.division ? divisionName(mine.division, td) : null} progress={chProgress} completed={chProgress != null && chProgress.done >= CHALLENGE_MATCHES} loggedIn={session != null} />
      </section>

      <section id="site" className="scroll-mt-6">
        <div className="rule mb-5"><span className="kicker">{t('site.title')}</span></div>
        <div className="grid gap-4 sm:grid-cols-3">
          {site.map((it) => (
            <div key={it.name} className="panel flex flex-col p-5">
              <p className="font-display text-lg text-gold-300">{it.name}</p>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-parchment-200">{it.what}</p>
              <p className="mt-3 text-sm"><Link href={it.href}>{it.link} →</Link></p>
            </div>
          ))}
        </div>
      </section>

      <section id="order" className="scroll-mt-6">
        <div className="rule mb-5"><span className="kicker">{t('order.title')}</span></div>
        <ol className="space-y-3">
          {order.map((text, i) => (
            <li key={i} className="panel flex gap-4 p-5">
              <span className="stat-num flex h-8 w-8 flex-none items-center justify-center rounded-full border border-gold-500 text-gold-300">{i + 1}</span>
              <p className="leading-relaxed text-parchment-200">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {EXT.map((s) => {
        const items = t.raw(`ext.${s}.items`) as ExtItem[];
        const intro = s === 'qol' ? t('ext.qol.intro') : null;
        return (
          <section key={s} id={s} className="scroll-mt-6">
            <div className="rule mb-5"><span className="kicker">{t(`ext.${s}.title`)}</span></div>
            {intro && <p className="mb-4 text-sm text-parchment-300">{intro}</p>}
            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((it) => (
                <li key={it.name} className="panel p-5">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-lg text-gold-300">{it.name}</span>
                    {it.url ? (
                      <a href={it.url} target="_blank" rel="noreferrer" className="flex flex-none items-center gap-1 text-sm">{t('open')} <ExternalLink className="h-3.5 w-3.5" /></a>
                    ) : (
                      <span className="tag flex-none !text-[0.65rem]">{t('inGame')}</span>
                    )}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-parchment-200">{it.what}</p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <p className="text-sm text-parchment-400">{t('roadmap')}</p>
    </div>
  );
}
