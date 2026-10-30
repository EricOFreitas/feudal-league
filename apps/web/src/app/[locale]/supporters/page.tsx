import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Search, X } from 'lucide-react';
import { BADGE_KEYS, badgeCounts, isBadgeKey, supportersList, type BadgeKey } from '@aoe2/sync';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { BadgeIcon, BadgeTag } from '@/components/badge-list';
import { Flag } from '@/components/flag';
import { Link } from '@/i18n/navigation';

type SP = { q?: string; b?: string; more?: string };
type Props = { params: Promise<{ locale: string }>; searchParams: Promise<SP> };

const FIRST_PAGE = 12;
const MORE_PAGE = 60;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'supporters' });
  return { title: t('metaTitle') };
}

export default async function SupportersPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('supporters');
  const tb = await getTranslations('badges');
  const tn = await getTranslations('nav');
  const donate = process.env.DONATION_URL;

  const q = (sp.q ?? '').trim().slice(0, 40);
  const badge: BadgeKey | null = isBadgeKey(sp.b) ? sp.b : null;
  const more = sp.more === '1';

  const [counts, list] = await Promise.all([
    badgeCounts(),
    supportersList({ badge, q, limit: more ? MORE_PAGE : FIRST_PAGE }),
  ]);
  // Card do apoiador conta também quem escondeu o badge (só o número, sem nome).
  const cardCount = (k: BadgeKey) => counts[k] + (k === 'supporter' ? counts.hiddenSupporters : 0);
  const showAnon = counts.hiddenSupporters > 0 && (badge == null || badge === 'supporter');

  const hrefWith = (patch: Partial<Record<keyof SP, string | null>>) => {
    const next = { q: q || null, b: badge, more: more ? '1' : null, ...patch };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v);
    const s = qs.toString();
    return s ? `/supporters?${s}` : '/supporters';
  };
  const chips: { key: BadgeKey | null; label: string }[] = [{ key: null, label: t('all') }, ...BADGE_KEYS.map((k) => ({ key: k, label: tb(`${k}.label`) }))];

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <Breadcrumbs items={[{ label: tn('about'), href: '/about' }, { label: tn('supporters') }]} />

      <header>
        <p className="kicker">{t('kicker')}</p>
        <h1 className="text-3xl font-semibold text-gold-300 sm:text-4xl">{t('title')}</h1>
        <p className="mt-3 max-w-[44rem] text-lg text-pretty text-parchment-200">{t('intro')}</p>
      </header>

      <section>
        <div className="rule mb-5"><span className="kicker">{t('badgesTitle')}</span></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BADGE_KEYS.map((k) => (
            <div key={k} className="panel flex flex-col gap-2 p-5">
              <BadgeIcon badge={k} className="h-7 w-7" strokeWidth={1.8} />
              <h2 className="text-lg font-normal text-gold-300">{tb(`${k}.label`)}</h2>
              <p className="text-[0.95rem] text-parchment-200">{tb(`${k}.how`)}</p>
              <p className="mt-auto text-[0.85rem] text-parchment-400">{t('count', { n: cardCount(k) })}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="rule mb-5"><span className="kicker">{t('people')}</span></div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <form action={`/${locale}/supporters`} method="get" role="search" className="relative min-w-0 flex-[1_1_220px]">
              {badge && <input type="hidden" name="b" value={badge} />}
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-parchment-400" />
              <input
                name="q"
                defaultValue={q}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchPlaceholder')}
                autoComplete="off"
                maxLength={40}
                className="input !py-2.5 !pr-9 !pl-10 !text-base"
              />
              {q && (
                <Link href={hrefWith({ q: null, more: null })} aria-label={t('clearSearch')} className="absolute top-1/2 right-1.5 flex -translate-y-1/2 p-1 text-parchment-400 hover:text-gold-300">
                  <X className="h-4 w-4" />
                </Link>
              )}
            </form>
            <nav aria-label={t('filters')} className="flex flex-wrap gap-2">
              {chips.map((c) => {
                const on = c.key === badge;
                return (
                  <Link
                    key={c.key ?? 'all'}
                    href={hrefWith({ b: c.key, more: null })}
                    aria-current={on ? 'page' : undefined}
                    className={`rounded-[3px] border px-3 py-1.5 font-display text-[0.72rem] tracking-[0.15em] uppercase hover:border-gold-500 hover:!text-gold-300 hover:no-underline ${on ? 'border-gold-500 bg-gold-600/30 !text-gold-300' : 'border-gold-700 !text-parchment-400'}`}
                  >
                    {c.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {list.rows.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.rows.map((p) => (
                <li key={p.playerId} className="panel px-4 py-3.5">
                  <div className="relative z-[1] flex flex-col gap-2">
                    <Link href={`/players/${p.profileId}`} className="flex min-w-0 items-center gap-2 !text-parchment-50 hover:!text-gold-300">
                      <Flag code={p.flag} className="text-xl" />
                      <span className="truncate font-display">{p.alias}</span>
                    </Link>
                    <div className="flex flex-wrap gap-1.5">
                      {p.badges.map((b) => <BadgeTag key={b} badge={b} label={tb(`${b}.label`)} title={tb(`${b}.title`)} />)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="italic text-parchment-400">{q ? t('empty') : t('none')}</p>
          )}

          {(showAnon || (!more && list.total > list.rows.length)) && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[0.95rem] text-parchment-300">{showAnon ? t('anon', { n: counts.hiddenSupporters }) : ''}</p>
              {!more && list.total > list.rows.length && (
                <Link href={hrefWith({ more: '1' })} scroll={false} className="btn btn-ghost !px-4 !py-2.5 !text-xs whitespace-nowrap hover:no-underline">
                  {t('more')}
                </Link>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="relative z-[1] min-w-0 flex-[1_1_320px]">
          <p className="kicker">{t('ctaKicker')}</p>
          <p className="mt-1.5 text-parchment-200">{t('ctaText')}</p>
        </div>
        <div className="relative z-[1] flex flex-wrap gap-2">
          <Link href="/about" className="btn btn-ghost !px-4 !py-2.5 !text-xs whitespace-nowrap hover:no-underline">{t('contribute')}</Link>
          {donate && (
            <a href={donate} target="_blank" rel="noreferrer" className="btn !px-4 !py-2.5 !text-xs whitespace-nowrap !text-stone-950 hover:no-underline">{t('donate')}</a>
          )}
        </div>
      </div>
    </div>
  );
}
