import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from './locale-switcher';
import { NavLinks } from './nav-links';
import { Crest } from './crest';
import { getSession } from '@/lib/session';

export async function Header() {
  const t = await getTranslations('nav');
  const site = await getTranslations('site');
  const session = await getSession();

  return (
    <header className="border-b border-gold-700/60 bg-stone-900/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3 no-underline hover:no-underline">
          <Crest className="h-9 w-9" />
          <span className="font-display text-lg font-semibold tracking-wide text-gold-300">{site('name')}</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <NavLinks items={[{ href: '/leagues', label: t('leagues') }, { href: '/tournaments', label: t('tournaments') }]} />
          <LocaleSwitcher label={t('language')} />
          {session ? (
            <>
              <Link href="/me" className="btn btn-ghost !py-1.5 !px-3 !text-xs">{t('me')}</Link>
              <a href="/auth/logout" className="text-parchment-300 hover:text-gold-300">{t('logout')}</a>
            </>
          ) : (
            <a href="/auth/steam" className="btn !py-1.5 !px-3 !text-xs">{t('login')}</a>
          )}
        </nav>
      </div>
    </header>
  );
}
