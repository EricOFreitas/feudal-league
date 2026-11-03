/**
 * Cliente do serviço de análise de replay (apps/analyzer): POST /parse → resumo JSON da gravação.
 * Usado pela análise com IA (analyses.ts) e pela colheita de métricas de treino (metrics.ts).
 */
const ANALYZER_URL = process.env.ANALYZER_URL ?? 'http://127.0.0.1:8000';

export type ParseOut = {
  duration_s: number;
  header_ok: boolean;
  slots: Record<string, number>;
  players: Record<string, {
    profile_id: number | null; actions: number; apm: number;
    ages: Record<'feudal' | 'castle' | 'imperial', { click_s: number | null; reached_s: number | null } | null>;
    techs: { t_s: number; name: string }[]; units_queued: Record<string, number>;
    first_military: { t_s: number; unit: string } | null; buildings: Record<string, number>;
    building_first_s: Record<string, number>; villagers_queued_per_5min: number[]; villagers_only_per_5min?: number[]; villagers_done_per_5min?: number[]; villagers_start?: number; civ?: string | null; military_queued_per_5min: number[];
    town_centers: number; market_s: number | null; walls: number; deletes: number; idle_gaps_60s: number; resigned_s: number | null;
    tc_idle_s?: number; tc_idle_until_s?: number | null;
    chat: { t_s: number; text: string }[];
  }>;
};

export class AnalyzerError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** civs: profile_id → civ em inglês (bônus que mudam tempos do TC; opcional). */
export async function parseReplay(matchId: number, profileIds: number[], civs: Record<number, string> = {}): Promise<ParseOut> {
  const res = await fetch(`${ANALYZER_URL}/parse`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ game_id: matchId, profile_ids: profileIds, civs }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AnalyzerError(`analyzer HTTP ${res.status}: ${body.slice(0, 200)}`, res.status);
  }
  return (await res.json()) as ParseOut;
}
