/**
 * Treino, etapa T3 (docs/TREINO.md): foco de treino = o número que mais ficou atrás da divisão nas últimas partidas.
 * Uma coisa por vez. Calculado ao vivo a partir de match_metrics, então muda sozinho a cada partida lida.
 *
 * Regra: nas últimas FOCUS_MATCHES partidas lidas, pra cada métrica conta em quantas o jogador ficou pior que a mediana
 * da divisão. Vence a métrica pior na maioria das partidas; empate decide a ordem de treino (FOCUS_PRIORITY).
 * Se nada ficou atrás da própria divisão, compara com a divisão acima. Se também não, o jogador está "à frente".
 */
import { db, matchMetrics } from '@aoe2/db';
import { and, desc, eq } from 'drizzle-orm';
import { membershipsOf } from './leagues';
import { BENCHMARK_SHOW_SAMPLES, LOWER_IS_BETTER, benchmarksForLeague, divisionAbove, type DivisionBenchmark, type MetricKey, type MetricNumbers } from './metrics';

/** Últimas partidas lidas que entram na conta, e quantas comparáveis a métrica precisa ter. */
export const FOCUS_MATCHES = 5;
export const FOCUS_MIN_MATCHES = 3;
/** Desempate = ordem de treino: Centro parado e aldeões aos 10 são o que mais separa divisões; APM por último (consequência, não causa). */
export const FOCUS_PRIORITY: MetricKey[] = ['tcIdleS', 'vils10', 'feudalS', 'vils15', 'castleS', 'vils20', 'firstMilitaryS', 'imperialS', 'apm'];

export type TrainingFocus =
  /** a métrica a treinar; mine/target são medianas (do jogador nas partidas comparáveis, e da divisão de referência) */
  | { kind: 'focus'; key: MetricKey; worse: number; total: number; mine: number; target: number; level: 'division' | 'above' }
  /** na mediana ou melhor em tudo; checkedAbove = também comparado com a divisão de cima */
  | { kind: 'ahead'; total: number; checkedAbove: boolean }
  /** menos de FOCUS_MIN_MATCHES partidas lidas */
  | { kind: 'few'; total: number }
  /** divisão sem amostras suficientes pra comparar */
  | { kind: 'noBench'; total: number };

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

function against(rows: MetricNumbers[], bench: DivisionBenchmark, level: 'division' | 'above'): TrainingFocus | null {
  let best: Extract<TrainingFocus, { kind: 'focus' }> | null = null;
  for (const key of FOCUS_PRIORITY) {
    const target = bench.metrics[key]?.p50;
    if (target == null) continue;
    const values = rows.map((r) => r[key]).filter((v): v is number => v != null);  // null = não comparável (não chegou à era, partida curta)
    if (values.length < FOCUS_MIN_MATCHES) continue;
    const worse = values.filter((v) => (LOWER_IS_BETTER[key] ? v > target : v < target)).length;
    if (worse * 2 <= values.length) continue;  // precisa ser pior na maioria
    // maior proporção vence; empate fica com quem veio antes na prioridade (o primeiro achado)
    if (!best || worse / values.length > best.worse / best.total) best = { kind: 'focus', key, worse, total: values.length, mine: median(values), target, level };
  }
  return best;
}

/** Escolhe o foco a partir das linhas já carregadas (puro; testável). */
export function pickFocus(rows: MetricNumbers[], division: DivisionBenchmark | null, above: DivisionBenchmark | null): TrainingFocus {
  if (rows.length < FOCUS_MIN_MATCHES) return { kind: 'few', total: rows.length };
  if (!division || division.samples < BENCHMARK_SHOW_SAMPLES) return { kind: 'noBench', total: rows.length };
  const own = against(rows, division, 'division');
  if (own) return own;
  const aboveOk = above != null && above.samples >= BENCHMARK_SHOW_SAMPLES;
  const up = aboveOk ? against(rows, above, 'above') : null;
  return up ?? { kind: 'ahead', total: rows.length, checkedAbove: aboveOk };
}

/** Foco do jogador dado os benchmarks da divisão dele (a página do perfil já tem os dois). */
export async function trainingFocus(profileId: number, division: DivisionBenchmark | null, above: DivisionBenchmark | null): Promise<TrainingFocus> {
  const rows = await db.query.matchMetrics.findMany({
    where: and(eq(matchMetrics.profileId, profileId), eq(matchMetrics.status, 'ok')),
    orderBy: [desc(matchMetrics.playedAt)], limit: FOCUS_MATCHES,
  });
  return pickFocus(rows, division, above);
}

/** Foco com a divisão resolvida pela liga do jogador (Global primeiro), pra páginas que não têm os benchmarks na mão. */
export async function trainingFocusOf(player: { id: number; profileId: number }) {
  const memberships = await membershipsOf(player.id);
  const home = memberships.find((m) => m.league.isGlobal) ?? memberships[0] ?? null;
  if (!home) return { focus: await trainingFocus(player.profileId, null, null), division: null, above: null };
  const bench = await benchmarksForLeague(home.leagueId);
  const above = await divisionAbove(home.divisionId);
  const focus = await trainingFocus(player.profileId, bench.get(home.divisionId) ?? null, above ? bench.get(above.id) ?? null : null);
  return { focus, division: home.division, above };
}
