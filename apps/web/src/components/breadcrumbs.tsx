import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BackButton } from './back-button';

export type Crumb = { label: string; href?: string };

/**
 * Trilha de navegação das páginas internas: botão Voltar + Início / … / página atual.
 * O último item é a página atual (sem link). O Voltar cai no penúltimo item se não houver histórico.
 */
export async function Breadcrumbs({ items }: { items: Crumb[] }) {
  const t = await getTranslations('nav');
  const tc = await getTranslations('common');
  const all: Crumb[] = [{ label: t('home'), href: '/' }, ...items];
  const parent = [...all].reverse().find((c, i) => i > 0 && c.href)?.href ?? '/';
  return (
    <nav aria-label={t('home')} className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <BackButton fallback={parent} label={tc('back')} />
      <ol className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {all.map((c, i) => {
          const last = i === all.length - 1;
          return (
            <li key={i} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <span className="text-stone-500">/</span>}
              {last || !c.href ? (
                <span aria-current="page" className="truncate text-parchment-100">{c.label}</span>
              ) : (
                <Link href={c.href} className="text-parchment-300 hover:text-gold-300">{c.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
