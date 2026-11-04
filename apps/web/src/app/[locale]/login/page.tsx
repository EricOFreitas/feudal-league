import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { Crest } from '@/components/crest';
import { Link } from '@/i18n/navigation';

const SOURCE_URL = 'https://github.com/EricOFreitas/feudal-league';

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string }> };

/** Página Entrar: o botão do cabeçalho vem pra cá antes da Steam, pra explicar o que o login faz e o que não faz. */
export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { error } = await searchParams;
  const t = await getTranslations('auth');
  const tn = await getTranslations('nav');
  const safe = t.raw('safe.items') as string[];
  return (
    <>
      <Breadcrumbs items={[{ label: tn('login') }]} />
      <div className="panel corners mx-auto max-w-lg p-8">
        <div className="text-center">
          <Crest className="mx-auto h-16 w-16" />
          <h1 className="mt-4 text-3xl text-gold-300">{t('title')}</h1>
          <p className="mt-3 text-parchment-200">{t('why')}</p>
          {error && <p className="mt-4 text-crimson-500">{t('failed')}</p>}
          <a href="/auth/steam" className="btn mt-6">{tn('login')}</a>
        </div>
        <div className="mt-8 border-t border-gold-800/40 pt-6">
          <p className="kicker flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-moss-500" />{t('safe.title')}</p>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-parchment-200">
            {safe.map((text, i) => <li key={i} className="flex gap-2"><span className="text-gold-500">•</span><span>{text}</span></li>)}
          </ul>
          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">{t('safe.source')} <ExternalLink className="h-3 w-3" /></a>
            <Link href="/rules#account">{t('safe.faq')} →</Link>
          </p>
        </div>
      </div>
    </>
  );
}
