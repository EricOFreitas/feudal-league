import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Crest } from '@/components/crest';

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string }> };

export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { error } = await searchParams;
  const t = await getTranslations('auth');
  const tn = await getTranslations('nav');
  return (
    <div className="panel corners mx-auto max-w-md p-8 text-center">
      <Crest className="mx-auto h-16 w-16" />
      <h1 className="mt-4 text-3xl text-gold-300">{t('title')}</h1>
      <p className="mt-3 text-parchment-200">{t('why')}</p>
      <p className="mt-1 text-sm text-parchment-400">{t('steamOnly')}</p>
      {error && <p className="mt-4 text-crimson-500">{t('failed')}</p>}
      <a href="/auth/steam" className="btn mt-6">{tn('login')}</a>
    </div>
  );
}
