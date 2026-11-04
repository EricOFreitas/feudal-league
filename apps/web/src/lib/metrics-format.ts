import type { MetricKey } from '@aoe2/sync';

/** Métricas de treino que são tempo (mm:ss); o resto é contagem. */
export const TIME_KEYS = new Set<MetricKey>(['feudalS', 'castleS', 'imperialS', 'tcIdleS', 'firstMilitaryS']);
/** Chave de tradução (benchmarks.metric.*, focus.goal.*, focus.tip.*) de cada métrica. */
export const METRIC_LABEL: Record<MetricKey, string> = {
  feudalS: 'feudal', castleS: 'castle', imperialS: 'imperial', vils10: 'vils10', vils15: 'vils15', vils20: 'vils20', tcIdleS: 'tcIdle', firstMilitaryS: 'firstMilitary', apm: 'apm',
};
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;
export const fmtMetric = (k: MetricKey, v: number) => (TIME_KEYS.has(k) ? mmss(v) : String(Math.round(v)));
