'use client';

import { Link, usePathname } from '@/i18n/navigation';

/** Links do cabeçalho com a seção atual destacada. */
export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((it) => {
        const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
        return (
          <Link key={it.href} href={it.href} className={`font-display tracking-wide hover:text-gold-300 ${active ? 'text-gold-300' : 'text-parchment-200'}`} aria-current={active ? 'page' : undefined}>
            {it.label}
          </Link>
        );
      })}
    </>
  );
}
