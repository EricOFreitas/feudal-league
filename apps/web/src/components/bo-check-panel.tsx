import { getTranslations } from 'next-intl/server';
import { ClipboardCheck } from 'lucide-react';
import { BUILD_ORDERS, checkBuildOrder, type BuildOrder, type CheckStatus, type ParseEvent } from '@aoe2/sync';

type Props = {
  locale: string;
  /** Linha do tempo da gravação; null = lida antes do conferidor existir. */
  events: ParseEvent[] | null;
  ages: { feudalS: number | null; castleS: number | null };
  selected: BuildOrder | null;
  /** URL base do formulário (GET ?bo=). */
  action: string;
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;
const TONE: Record<CheckStatus, string> = { ok: 'text-moss-500', early: 'text-moss-500', late: 'text-crimson-500', off_vils: 'text-gold-300', missing: 'text-crimson-500' };

/** Conferidor de build order (treino, T2): formulário de escolha + tabela de marcos. Servidor, sem estado. */
export async function BoCheckPanel({ locale, events, ages, selected, action }: Props) {
  const t = await getTranslations('bo');
  const lang: 'pt' | 'en' = locale.startsWith('en') ? 'en' : 'pt';
  const result = selected && events ? checkBuildOrder(selected, events, ages, events[0] ? Math.min(events[0].v, 6) : 3) : null;

  return (
    <div>
      <p className="kicker flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-gold-400" />{t('title')}</p>
      <p className="mt-2 text-sm text-parchment-300">{t('intro')}</p>
      <form action={action} method="get" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-parchment-200">
          {t('choose')}
          <select name="bo" defaultValue={selected?.id ?? ''} className="input !py-2 !text-sm">
            <option value="">{t('none')}</option>
            {BUILD_ORDERS.map((b) => <option key={b.id} value={b.id}>{b.name[lang]}</option>)}
          </select>
        </label>
        <button className="btn btn-ghost !px-3 !py-2 !text-xs">{t('check')}</button>
      </form>

      {selected && !events && <p className="mt-4 text-sm text-parchment-400">{t('noEvents')}</p>}

      {selected && result && (
        <div className="mt-5 space-y-4">
          <div>
            <p className="font-display text-lg text-gold-300">{selected.name[lang]} · <span className="stat-num">{t('score', { ok: result.ok, total: result.total, score: result.score })}</span></p>
            <p className="text-sm text-parchment-300">{selected.summary[lang]}</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-parchment-400">
                <th className="pb-2 font-normal">{t('col.step')}</th>
                <th className="pb-2 font-normal">{t('col.plan')}</th>
                <th className="pb-2 font-normal">{t('col.you')}</th>
                <th className="pb-2 font-normal">{t('col.status')}</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.key} className="border-t border-gold-800/40">
                  <td className="py-1.5 pr-3 text-parchment-200">{r.label[lang]}</td>
                  <td className="py-1.5 pr-3 text-parchment-300"><span className="stat-num text-parchment-50">{mmss(r.targetS)}</span> · {t('vils', { n: r.expectVils })}</td>
                  <td className="py-1.5 pr-3 text-parchment-300">
                    {r.actualS == null ? '–' : (<><span className={`stat-num ${TONE[r.status]}`}>{mmss(r.actualS)}</span> · {t('vils', { n: r.actualVils ?? 0 })}</>)}
                  </td>
                  <td className={`py-1.5 font-display ${TONE[r.status]}`}>{t(`status.${r.status}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <details className="text-sm">
            <summary className="cursor-pointer text-parchment-300">{t('split')}</summary>
            <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-parchment-200">{selected.split[lang].map((s, i) => <li key={i}>{s}</li>)}</ol>
          </details>
          <p className="text-xs text-parchment-400">{t('tolerance')}</p>
        </div>
      )}
    </div>
  );
}
