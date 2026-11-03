import { getTranslations } from 'next-intl/server';
import { BENCHMARK_SHOW_SAMPLES, LOWER_IS_BETTER, METRIC_KEYS, type DivisionBenchmark, type MetricKey, type MetricNumbers } from '@aoe2/sync';

const TIME_KEYS = new Set<MetricKey>(['feudalS', 'castleS', 'imperialS', 'tcIdleS', 'firstMilitaryS']);
const LABEL: Record<MetricKey, string> = {
  feudalS: 'feudal', castleS: 'castle', imperialS: 'imperial', vils10: 'vils10', vils15: 'vils15', vils20: 'vils20', tcIdleS: 'tcIdle', firstMilitaryS: 'firstMilitary', apm: 'apm',
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;
const fmt = (k: MetricKey, v: number) => (TIME_KEYS.has(k) ? mmss(v) : String(Math.round(v)));

type Props = {
  /** Números do jogador (uma partida ou mediana das últimas). */
  mine: MetricNumbers;
  division: DivisionBenchmark | null;
  above: DivisionBenchmark | null;
  /** Rótulos das colunas de divisão; null em "acima" = já é a mais alta. */
  divisionLabel: string | null;
  aboveLabel: string | null;
  minSamples: number;
  /** false quando a página já tem título e introdução próprios (perfil do jogador). */
  heading?: boolean;
};

/** Tabela "Você / sua divisão / divisão acima" (treino, T1). Servidor; sem estado. */
export async function BenchmarkTable({ mine, division, above, divisionLabel, aboveLabel, minSamples, heading = true }: Props) {
  const t = await getTranslations('benchmarks');
  // mostra a partir de BENCHMARK_SHOW_SAMPLES; até minSamples avisa que ainda é pouco
  const enough = division != null && division.samples >= BENCHMARK_SHOW_SAMPLES;
  const few = enough && division.samples < minSamples;
  const aboveOk = above != null && above.samples >= BENCHMARK_SHOW_SAMPLES;

  const tone = (k: MetricKey, v: number | null) => {
    const ref = enough ? division.metrics[k]?.p50 : undefined;
    if (v == null || ref == null) return 'text-parchment-50';
    if (v === ref) return 'text-parchment-50';
    const better = LOWER_IS_BETTER[k] ? v < ref : v > ref;
    return better ? 'text-moss-500' : 'text-crimson-500';
  };
  const missing = (k: MetricKey) => (k === 'firstMilitaryS' ? t('none') : TIME_KEYS.has(k) && k !== 'tcIdleS' ? t('never') : '–');

  return (
    <div>
      {heading && <p className="kicker">{t('title')}</p>}
      {divisionLabel == null ? (
        <p className="mt-2 text-sm text-parchment-300">{t('noDivision')}</p>
      ) : enough ? (
        <>
          {heading && <p className="mt-2 text-sm text-parchment-300">{t('intro', { n: division.samples })}</p>}
          {few && <p className="mt-2 text-sm text-gold-300">{t('few', { n: division.samples, min: minSamples })}</p>}
        </>
      ) : (
        <p className="mt-2 text-sm text-parchment-300">{t('notEnough', { n: division?.samples ?? 0, min: BENCHMARK_SHOW_SAMPLES })}</p>
      )}
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-parchment-400">
            <th className="pb-2 font-normal">{t('col.metric')}</th>
            <th className="pb-2 font-normal">{t('col.you')}</th>
            {divisionLabel != null && <th className="pb-2 font-normal">{t('col.division')} · {divisionLabel}</th>}
            {divisionLabel != null && <th className="hidden pb-2 font-normal sm:table-cell">{t('col.above')}{aboveLabel ? ` · ${aboveLabel}` : ''}</th>}
          </tr>
        </thead>
        <tbody>
          {METRIC_KEYS.map((k) => {
            const v = mine[k];
            const d = enough ? division.metrics[k] : null;
            const a = aboveOk ? above.metrics[k] : null;
            return (
              <tr key={k} className="border-t border-gold-800/40">
                <td className="py-2 pr-3 text-parchment-200">{t(`metric.${LABEL[k]}`)}</td>
                <td className={`stat-num py-2 pr-3 ${tone(k, v)}`}>{v == null ? missing(k) : fmt(k, v)}</td>
                {divisionLabel != null && (
                  <td className="py-2 pr-3">
                    {d ? (<><span className="stat-num text-parchment-50">{fmt(k, d.p50)}</span><span className="ml-2 text-xs text-parchment-400">{t('range', { lo: fmt(k, d.p25), hi: fmt(k, d.p75) })}</span></>) : <span className="text-parchment-400">–</span>}
                  </td>
                )}
                {divisionLabel != null && (
                  <td className="hidden py-2 sm:table-cell">
                    {aboveLabel == null ? <span className="text-xs text-parchment-400">{t('topDivision')}</span> : a ? <span className="stat-num text-parchment-50">{fmt(k, a.p50)}</span> : <span className="text-parchment-400">–</span>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-parchment-400">{t('note')}</p>
    </div>
  );
}
