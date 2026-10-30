import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';

/** Números exibidos: primeira, vizinhas da atual e última; null = reticências. */
function pageList(page: number, pages: number): (number | null)[] {
  const nums = [...new Set([1, page - 1, page, page + 1, pages].filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1]! > 1) out.push(null);
    out.push(n);
  });
  return out;
}

const box = 'flex h-9 min-w-9 items-center justify-center rounded-[3px] border';

/** Seta anterior/próxima: link, ou apagada quando não há pra onde ir. */
function Arrow({ href, label, children }: { href: string | null; label: string; children: ReactNode }) {
  return href == null ? (
    <span aria-hidden className={`${box} border-gold-700 text-gold-300 opacity-40`}>{children}</span>
  ) : (
    <Link href={href} aria-label={label} className={`${box} border-gold-700 !text-gold-300 hover:bg-gold-500/10 hover:!no-underline`}>{children}</Link>
  );
}

/** Rodapé da tabela: "Página X de Y", anterior/próxima e números com reticências. Só links (sem JS). */
export async function LeaguePager({ page, pages, hrefFor }: { page: number; pages: number; hrefFor: (n: number) => string }) {
  const t = await getTranslations('leagues.detail');
  return (
    <nav aria-label={t('pagination')} className="flex flex-wrap items-center justify-between gap-3 border-t border-gold-700/50 pt-4">
      <span className="text-sm text-parchment-400">{t('pageInfo', { page, pages })}</span>
      <div className="flex flex-wrap items-center gap-1">
        <Arrow href={page > 1 ? hrefFor(page - 1) : null} label={t('prev')}><ChevronLeft className="h-4 w-4" /></Arrow>
        {pageList(page, pages).map((n, i) =>
          n == null ? (
            <span key={`gap-${i}`} className={`${box} border-transparent text-parchment-400`}>…</span>
          ) : (
            <Link
              key={n}
              href={hrefFor(n)}
              aria-current={n === page ? 'page' : undefined}
              className={`${box} px-2 font-display text-[0.85rem] tabular-nums hover:border-gold-500 hover:!no-underline ${n === page ? 'border-gold-500 bg-gold-600/30 !text-gold-300' : 'border-gold-700 !text-parchment-200'}`}
            >
              {n}
            </Link>
          ),
        )}
        <Arrow href={page < pages ? hrefFor(page + 1) : null} label={t('next')}><ChevronRight className="h-4 w-4" /></Arrow>
      </div>
    </nav>
  );
}
