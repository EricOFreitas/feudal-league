import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Breadcrumbs } from '@/components/breadcrumbs';

type Item = { q: string; a: string };
const SECTIONS = ['leagues', 'tournaments', 'analysis', 'account'] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'rules' });
  return { title: t('title'), description: t('intro') };
}

/** Regras e perguntas frequentes: texto em messages/parts/rules.*.json, uma lista de perguntas por seção. */
export default async function RulesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('rules');
  const tn = await getTranslations('nav');

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <Breadcrumbs items={[{ label: tn('rules') }]} />
      <header>
        <p className="kicker">{t('kicker')}</p>
        <h1 className="text-3xl font-semibold text-gold-300 sm:text-4xl">{t('title')}</h1>
        <p className="mt-3 max-w-2xl text-lg text-parchment-200">{t('intro')}</p>
        <nav className="mt-4 flex flex-wrap gap-2 text-sm">
          {SECTIONS.map((s) => <a key={s} href={`#${s}`} className="tag no-underline hover:border-gold-500 hover:no-underline">{t(`sections.${s}.title`)}</a>)}
        </nav>
      </header>

      {SECTIONS.map((s) => {
        const items = t.raw(`sections.${s}.items`) as Item[];
        return (
          <section key={s} id={s} className="scroll-mt-6">
            <div className="rule mb-5"><span className="kicker">{t(`sections.${s}.title`)}</span></div>
            <dl className="space-y-3">
              {items.map((it, i) => (
                <div key={i} className="panel p-5">
                  <dt className="font-display text-lg text-gold-300">{it.q}</dt>
                  <dd className="mt-2 leading-relaxed text-parchment-200">{it.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}

      <p className="text-sm text-parchment-400">{t('more')}</p>
    </div>
  );
}
