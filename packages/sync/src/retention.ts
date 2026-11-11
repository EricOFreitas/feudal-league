/**
 * Retenção de partidas (decisão do Eric, 11/11/2026): perfil reivindicado guarda o histórico inteiro; dos outros,
 * ficam só os últimos RETENTION_DAYS dias. Partida usada em liga, torneio, análise ou métricas nunca sai:
 * league_matches, match_analyses e match_metrics seriam apagadas em cascata, e tournament_games perderia o vínculo.
 * O worker apaga em lotes (uma vez por dia, ou a cada ciclo enquanto houver atraso) e a sincronização não importa
 * partida vencida sem jogador reivindicado (syncMatchHistory), senão o histórico voltaria.
 */
import { db, syncRuns } from '@aoe2/db';
import { desc, eq, sql } from 'drizzle-orm';

export const RETENTION_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 2000;
/** Teto por execução (partidas); o que sobrar sai no ciclo seguinte. */
const RUN_LIMIT = 50_000;
const RUN_BUDGET_MS = 90 * 1000;

/** Corte alinhado à meia-noite (UTC): assim o que vence muda uma vez por dia, e não a cada ciclo. */
export function retentionCutoff(now = new Date()): Date {
  const d = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Apaga um lote de partidas vencidas e devolve quantas saíram (membros vão junto, em cascata). */
async function purgeBatch(cutoff: Date, limit: number): Promise<number> {
  const rows = await db.execute<{ id: number }>(sql`
    delete from matches where id in (
      select m.id from matches m
      where m.completed_at < ${cutoff.toISOString()}::timestamptz
        and not exists (select 1 from match_members mm join players p on p.profile_id = mm.profile_id
                        where mm.match_id = m.id and p.claimed_by_user_id is not null)
        and not exists (select 1 from league_matches x where x.match_id = m.id)
        and not exists (select 1 from match_analyses x where x.match_id = m.id)
        and not exists (select 1 from match_metrics x where x.match_id = m.id)
        and not exists (select 1 from tournament_games x where x.match_id = m.id)
      limit ${limit}
    )
    returning id`);
  return rows.length;
}

/** Apaga partidas vencidas até o teto da execução ou o tempo acabar. */
export async function purgeOldMatches(now = new Date()): Promise<number> {
  const cutoff = retentionCutoff(now);
  const t0 = Date.now();
  let deleted = 0;
  while (deleted < RUN_LIMIT && Date.now() - t0 < RUN_BUDGET_MS) {
    const n = await purgeBatch(cutoff, Math.min(BATCH, RUN_LIMIT - deleted));
    deleted += n;
    if (n === 0) break;
  }
  return deleted;
}

/**
 * Hora de limpar: nunca rodou; a última execução apagou algo ou falhou (pode haver mais: repete no próximo ciclo);
 * ou a última que não achou nada foi antes da meia-noite (UTC) de hoje, quando o corte andou um dia.
 */
export async function retentionDue(now = new Date()): Promise<boolean> {
  const [last] = await db.select({ finishedAt: syncRuns.finishedAt, matches: syncRuns.matches, ok: syncRuns.ok })
    .from(syncRuns).where(eq(syncRuns.kind, 'retention')).orderBy(desc(syncRuns.finishedAt)).limit(1);
  if (!last || !last.ok || last.matches > 0) return true;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return last.finishedAt.getTime() < today;
}
