import { getTranslations } from 'next-intl/server';
import { Heart } from 'lucide-react';
import { Link } from '@/i18n/navigation';

const SOURCE_URL = 'https://github.com/EricOFreitas/feudal-league';

export async function Footer() {
  const t = await getTranslations('site');
  const tn = await getTranslations('nav');
  const donate = process.env.DONATION_URL;
  return (
    <footer className="mt-12 border-t border-gold-700/60 bg-stone-950/60">
      <div className="mx-auto max-w-6xl space-y-2 px-4 py-6 text-sm text-parchment-300 sm:px-6">
        <nav className="mb-2 flex flex-wrap gap-x-5 gap-y-2 font-display tracking-wide">
          <Link href="/about" className="text-parchment-200 no-underline hover:text-gold-300">{tn('about')}</Link>
          <Link href="/status" className="inline-flex items-center gap-1.5 text-parchment-200 no-underline hover:text-gold-300"><span className="h-1.5 w-1.5 rounded-full bg-moss-500" />{tn('status')}</Link>
          <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="text-parchment-200 no-underline hover:text-gold-300">{tn('source')}</a>
          <a href={`${SOURCE_URL}/blob/main/CONTRIBUTING.md#translations`} target="_blank" rel="noreferrer" className="text-parchment-200 no-underline hover:text-gold-300">{tn('translate')}</a>
          <Link href="/supporters" className="text-parchment-200 no-underline hover:text-gold-300">{tn('supporters')}</Link>
          {donate && <a href={donate} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-gold-300 no-underline hover:text-gold-400"><Heart className="h-3.5 w-3.5" />{t('donate')}</a>}
        </nav>
        <p>
          {t.rich('notice', {
            rules: (chunks) => (
              <a href="https://www.xbox.com/en-US/developers/rules" target="_blank" rel="noreferrer">{chunks}</a>
            ),
          })}
        </p>
        <p className="text-parchment-400">{t('source')}</p>
      </div>
    </footer>
  );
}
