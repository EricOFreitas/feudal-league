import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Heart } from 'lucide-react';
import { Breadcrumbs } from '@/components/breadcrumbs';

const REPO = 'https://github.com/EricOFreitas/feudal-league';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'about' });
  return { title: t('kicker') };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('about');
  const ts = await getTranslations('site');
  const tn = await getTranslations('nav');
  const donate = process.env.DONATION_URL;

  const how = [['I', 'c1'], ['II', 'c2'], ['III', 'c3']] as const;
  const contribute = [
    { k: 'code', href: REPO },
    { k: 'translate', href: `${REPO}/tree/main/apps/web/messages` },
    { k: 'issues', href: `${REPO}/issues` },
    { k: 'guide', href: `${REPO}/blob/main/CONTRIBUTING.md` },
  ] as const;
  const costs = [['server', 'serverWhen'], ['llm', 'llmWhen'], ['domain', 'domainWhen']] as const;

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <Breadcrumbs items={[{ label: tn('about') }]} />

      <header>
        <p className="kicker">{t('kicker')}</p>
        <h1 className="text-3xl font-semibold text-gold-300 sm:text-4xl">{t('title')}</h1>
        <p className="mt-3 text-lg text-parchment-200">{t('intro')}</p>
      </header>

      <section>
        <div className="rule mb-5"><span className="kicker">{t('how.title')}</span></div>
        <div className="grid gap-4 md:grid-cols-3">
          {how.map(([n, k]) => (
            <div key={k} className="panel p-5">
              <div className="stat-num relative z-[1] text-3xl">{n}</div>
              <h2 className="relative z-[1] mt-2 text-xl text-gold-300">{t(`how.${k}.title`)}</h2>
              <p className="relative z-[1] mt-1 text-parchment-200">{t(`how.${k}.text`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="rule mb-5"><span className="kicker">{t('contribute.title')}</span></div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {contribute.map(({ k, href }) => (
            <li key={k} className="panel flex flex-col gap-2 p-5">
              <h3 className="relative z-[1] text-lg text-gold-300">{t(`contribute.${k}.title`)}</h3>
              <p className="relative z-[1] text-[0.95rem] text-parchment-200">{t(`contribute.${k}.text`)}</p>
              <a href={href} target="_blank" rel="noreferrer" className="relative z-[1] mt-auto break-words font-mono text-[0.85rem]">{t(`contribute.${k}.link`)}</a>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="rule mb-5"><span className="kicker">{t('support.title')}</span></div>
        <div className="panel corners flex flex-wrap items-start gap-x-8 gap-y-5 p-6">
          <div className="relative z-[1] min-w-0 flex-1 basis-72">
            <h2 className="text-2xl text-gold-300">{t('support.heading')}</h2>
            <p className="mt-2 text-parchment-200">{t('support.text')}</p>
            <p className="mt-2 text-sm text-parchment-400">{t('support.badge')} <Link href="/supporters">{t('support.seeSupporters')}</Link></p>
            {donate ? (
              <a href={donate} target="_blank" rel="noreferrer" className="btn mt-5 whitespace-nowrap no-underline hover:text-stone-950 hover:no-underline"><Heart className="h-4 w-4" />{t('support.cta')}</a>
            ) : (
              <p className="mt-5 italic text-parchment-300">{t('support.soon')}</p>
            )}
          </div>
          <div className="relative z-[1] min-w-0 flex-1 basis-60">
            <p className="kicker mb-2.5">{t('support.where')}</p>
            <ul className="text-[0.95rem] text-parchment-200">
              {costs.map(([a, b], i) => (
                <li key={a} className={`flex justify-between gap-4 py-2 ${i < costs.length - 1 ? 'border-b border-gold-700/50' : ''} ${i === 0 ? 'pt-0' : ''}`}>
                  <span>{t(`support.${a}`)}</span><span className="text-parchment-400">{t(`support.${b}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section>
        <div className="rule mb-5"><span className="kicker">{t('legal.title')}</span></div>
        <div className="panel space-y-3 p-5 text-[0.95rem] text-parchment-200">
          <p className="relative z-[1]">
            {ts.rich('notice', {
              rules: (chunks) => <a href="https://www.xbox.com/en-US/developers/rules" target="_blank" rel="noreferrer">{chunks}</a>,
            })}
          </p>
          <p className="relative z-[1]">{t('legal.art')}</p>
          <p className="relative z-[1]">
            {t.rich('legal.license', {
              agpl: (chunks) => <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noreferrer">{chunks}</a>,
            })}
          </p>
          <p className="relative z-[1] text-parchment-400">{t('legal.api')}</p>
        </div>
      </section>
    </div>
  );
}
