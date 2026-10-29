'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';

const LABEL: Record<Locale, string> = { pt: 'PT', en: 'EN' };

export function LocaleSwitcher({ label }: { label: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div className="flex items-center gap-1" aria-label={label}>
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => router.replace(pathname, { locale: l })}
          className={`kicker rounded px-2 py-1 ${l === locale ? 'bg-gold-600/30 text-gold-300' : 'text-parchment-400 hover:text-gold-300'}`}
          aria-current={l === locale ? 'true' : undefined}
        >
          {LABEL[l]}
        </button>
      ))}
    </div>
  );
}
