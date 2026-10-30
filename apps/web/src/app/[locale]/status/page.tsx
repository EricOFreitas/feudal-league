import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { dailyHealth, healthy, lastRuns, openIncidents, recentIncidents } from '@aoe2/sync';
import { Breadcrumbs } from '@/components/breadcrumbs';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

const KINDS = ['league', 'detect', 'analysis', 'snapshot', 'notify'] as const;
const TZ = 'America/Sao_Paulo';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('status') };
}

/** "há 6 min" / "6 min ago", no locale da página. */
function ago(locale: string, date: Date) {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'short' });
  const min = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (min < 60) return rtf.format(-min, 'minute');
  if (min < 60 * 24) return rtf.format(-Math.round(min / 60), 'hour');
  return rtf.format(-Math.round(min / 1440), 'day');
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="rule mb-5"><span className="kicker">{children}</span></div>;
}

export default async function StatusPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('status');
  const tn = await getTranslations('nav');

  const [runs, days, open, incidents, syncOk] = await Promise.all([
    lastRuns(), dailyHealth(30), openIncidents(), recentIncidents(10), healthy('league', 30),
  ]);
  const ok = open.length === 0 && syncOk;
  const leagueRun = runs.find((r) => r.kind === 'league');

  const dtf = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const dayFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric', timeZone: 'UTC' });
  const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const dayLabel = (iso: string) => dayFmt.format(new Date(`${iso}T00:00:00Z`));

  // 30 células, uma por dia (hoje na última), a partir do fuso de São Paulo
  const byDay = new Map(days.map((d) => [d.day, d]));
  const todayBr = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const cells = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(`${todayBr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (29 - i));
    const iso = d.toISOString().slice(0, 10);
    const row = byDay.get(iso);
    let color = 'bg-stone-600';
    let label = t('dayNone');
    if (row && row.runs > 0) {
      if (row.errors === 0) { color = 'bg-moss-500'; label = t('dayOk'); }
      else if (row.errors < row.runs) { color = 'bg-gold-500'; label = t('dayWarn'); }
      else { color = 'bg-crimson-500'; label = t('dayDown'); }
    }
    return { iso, color, label, hasData: Boolean(row && row.runs > 0), up: Boolean(row && row.runs > 0 && row.errors < row.runs) };
  });
  const withData = cells.filter((c) => c.hasData).length;
  const pct = withData ? (Math.round((cells.filter((c) => c.up).length / withData) * 1000) / 10) : 100;
  const pctText = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(pct);

  const banner = open.length > 0 ? open[0]!.title : syncOk
    ? (leagueRun ? t('bannerOk', { when: ago(locale, leagueRun.finished_at) }) : t('bannerOkNoRun'))
    : t('bannerBad');

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <Breadcrumbs items={[{ label: tn('status') }]} />
      <header>
        <p className="kicker">{t('kicker')}</p>
        <h1 className="font-display text-3xl font-semibold tracking-wide text-gold-300 sm:text-4xl">{ok ? t('okTitle') : t('badTitle')}</h1>
        <p className="mt-2 text-parchment-200 [text-wrap:pretty]">{t('intro')}</p>
      </header>

      <div className={`panel corners flex items-center gap-3 px-5 py-4 ${ok ? 'border-moss-500' : 'border-crimson-500'}`}>
        <span className={`h-2.5 w-2.5 flex-none rounded-full ${ok ? 'bg-moss-500 shadow-[0_0_0_4px_rgba(79,122,58,0.25)]' : 'bg-crimson-500 shadow-[0_0_0_4px_rgba(180,60,50,0.25)]'}`} />
        <p className="relative z-10 text-parchment-50">{banner}</p>
      </div>

      <section>
        <SectionTitle>{t('syncTitle')}</SectionTitle>
        <ul className="flex flex-col gap-2">
          {KINDS.map((k) => {
            const r = runs.find((x) => x.kind === k);
            const good = r ? r.ok : false;
            const text = good ? 'text-moss-500' : 'text-crimson-500';
            return (
              <li key={k} className={`panel flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-l-[3px] p-4 ${good ? 'border-l-moss-500' : 'border-l-crimson-500'}`}>
                <div className="relative z-10 min-w-0 flex-1 basis-60">
                  <p className="font-display text-parchment-50">{t(`kinds.${k}.name`)}</p>
                  <p className="text-sm text-parchment-300">{t(`kinds.${k}.desc`)}</p>
                </div>
                <div className="relative z-10 flex-none text-right text-sm">
                  <span className={text}>{r ? ago(locale, r.finished_at) : t('never')}</span><br />
                  <span className="text-stone-400">
                    {r ? `${t('runs24h', { count: r.runs_24h })} · ${t('errors24h', { count: r.errors_24h })}` : '—'}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <SectionTitle>{t('uptimeTitle')}</SectionTitle>
        <div className="panel p-5">
          <div className="relative z-10 grid grid-cols-[repeat(30,minmax(0,1fr))] gap-[3px]">
            {cells.map((c) => (
              <span key={c.iso} title={`${dayLabel(c.iso)} · ${c.label}`} className={`h-7 rounded-[2px] ${c.color}`} />
            ))}
          </div>
          <div className="relative z-10 mt-2 flex justify-between text-[0.8rem] text-stone-400">
            <span>{dayLabel(cells[0]!.iso)}</span>
            <span>{t('uptimePct', { pct: pctText })}</span>
            <span>{t('today')}</span>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>{t('incidentsTitle')}</SectionTitle>
        {incidents.length === 0 ? (
          <p className="text-center text-parchment-300">{t('noIncidents')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {incidents.map((i) => {
              const start = i.startedAt;
              const end = i.endedAt;
              const sameDay = end && localDay.format(start) === localDay.format(end);
              const when = !end
                ? `${dtf.format(start)} – ${t('ongoing')}`
                : sameDay ? `${dtf.format(start)}–${timeFmt.format(end)}` : `${dtf.format(start)} – ${dtf.format(end)}`;
              return (
                <li key={i.id} className="panel p-4">
                  <div className="relative z-10 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-display text-parchment-50">{i.title}</p>
                    <span className="text-[0.8rem] text-stone-400">{when}</span>
                  </div>
                  {i.body && <p className="relative z-10 mt-1 text-sm text-parchment-300">{i.body}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
