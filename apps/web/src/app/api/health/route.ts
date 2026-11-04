import { NextResponse } from 'next/server';
import { db } from '@aoe2/db';
import { activeSeason, divisionCounts, lastRuns, openIncidents, standings } from '@aoe2/sync';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/** Worker sem execução bem-sucedida da sincronização de liga há mais que isto = problema. */
const WORKER_STALE_MIN = 20;
/** Sonda do banco (select 1 + classificação da maior divisão da Global) acima disto = banco lento. */
const DB_SLOW_MS = 1500;
const GLOBAL_LEAGUE_ID = 1;

/**
 * Saúde do site pra monitor externo (Hermes-Infra): JSON pequeno, sem dados pessoais nem texto de erro interno.
 * ok = worker rodou há pouco, nenhum incidente grave aberto e banco respondendo rápido.
 * A sonda mede o banco compartilhado do ponto de vista do app: se outro app o derrubar, aparece aqui.
 */
export async function GET() {
  const at = new Date();
  try {
    const t0 = performance.now();
    await db.execute(sql`select 1`);
    const pingMs = Math.round(performance.now() - t0);

    const t1 = performance.now();
    const season = await activeSeason(GLOBAL_LEAGUE_ID);
    if (season) {
      const counts = await divisionCounts(season.id);
      const biggest = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (biggest != null) await standings(season.id, biggest);
    }
    const standingsMs = Math.round(performance.now() - t1);

    const runs = await lastRuns();
    const kinds = Object.fromEntries(runs.map((r) => [r.kind, { agoMin: Math.round((at.getTime() - r.finished_at.getTime()) / 60_000), ok: r.ok, runs24h: r.runs_24h, errors24h: r.errors_24h }]));
    const league = runs.find((r) => r.kind === 'league');
    const workerAgoMin = league ? Math.round((at.getTime() - league.finished_at.getTime()) / 60_000) : null;
    const incidents = (await openIncidents()).map((i) => ({ title: i.title, severity: i.severity, since: i.startedAt.toISOString() }));

    const problems: string[] = [];
    if (workerAgoMin == null || workerAgoMin > WORKER_STALE_MIN) problems.push('worker parado');
    if (incidents.some((i) => i.severity === 'major')) problems.push('incidente grave aberto');
    if (pingMs + standingsMs > DB_SLOW_MS) problems.push('banco lento');

    return NextResponse.json(
      { ok: problems.length === 0, problems, at: at.toISOString(), db: { pingMs, standingsMs }, worker: { agoMin: workerAgoMin, kinds }, incidents },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json({ ok: false, problems: ['erro ao consultar o banco'], at: at.toISOString(), error: (e as Error).name }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
