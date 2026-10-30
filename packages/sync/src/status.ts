/**
 * Registro de execuções do worker e resumo pra página de status.
 * O worker chama recordSyncRun() ao fim de cada etapa; a página lê statusSummary().
 */
import { db, incidents, syncRuns } from '@aoe2/db';
import { and, desc, gt, isNull, sql } from 'drizzle-orm';

export type SyncKind = 'league' | 'claimed' | 'viewed' | 'detect' | 'tournament' | 'analysis' | 'notify' | 'snapshot';

export async function recordSyncRun(kind: SyncKind, startedAt: Date, data: { players?: number; matches?: number; ok?: boolean; error?: string | null } = {}) {
  await db.insert(syncRuns).values({
    kind, startedAt, finishedAt: new Date(), players: data.players ?? 0, matches: data.matches ?? 0, ok: data.ok ?? true, error: data.error ?? null,
  });
  // mantém só 60 dias
  await db.delete(syncRuns).where(sql`${syncRuns.finishedAt} < now() - interval '60 days'`);
}

/** Última execução de cada tipo e contagens das últimas 24 h. */
export async function lastRuns() {
  const rows = await db.execute<{ kind: string; finished_at: Date; ok: boolean; error: string | null; players: number; matches: number; runs_24h: number; errors_24h: number }>(sql`
    select distinct on (kind) kind, finished_at, ok, error, players, matches,
      (select count(*) from sync_runs r2 where r2.kind = sync_runs.kind and r2.finished_at > now() - interval '24 hours')::int as runs_24h,
      (select count(*) from sync_runs r3 where r3.kind = sync_runs.kind and r3.finished_at > now() - interval '24 hours' and not r3.ok)::int as errors_24h
    from sync_runs order by kind, finished_at desc
  `);
  return [...rows].map((r) => ({ ...r, finished_at: new Date(r.finished_at) }));
}

/** Por dia, nos últimos N dias: houve execução? houve erro? (pra barra de uptime). */
export async function dailyHealth(days = 30) {
  const rows = await db.execute<{ day: string; runs: number; errors: number }>(sql`
    select to_char(date_trunc('day', finished_at at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD') as day,
           count(*)::int as runs, count(*) filter (where not ok)::int as errors
    from sync_runs where finished_at > now() - make_interval(days => ${days})
    group by 1 order by 1
  `);
  return [...rows];
}

export async function openIncidents() {
  return db.query.incidents.findMany({ where: isNull(incidents.endedAt), orderBy: [desc(incidents.startedAt)] });
}
export async function recentIncidents(limit = 10) {
  return db.query.incidents.findMany({ orderBy: [desc(incidents.startedAt)], limit });
}

/** Abre um incidente se não houver um aberto com o mesmo título; fecha ao resolver. */
export async function openIncident(title: string, body: string | null, severity: 'minor' | 'major' = 'minor') {
  const open = await db.query.incidents.findFirst({ where: and(isNull(incidents.endedAt), sql`${incidents.title} = ${title}`) });
  if (open) return open.id;
  const [row] = await db.insert(incidents).values({ title, body, severity }).returning({ id: incidents.id });
  return row!.id;
}
export async function closeIncident(title: string) {
  await db.update(incidents).set({ endedAt: new Date() }).where(and(isNull(incidents.endedAt), sql`${incidents.title} = ${title}`));
}

/** Houve execução com sucesso de `kind` nos últimos `minutes`? */
export async function healthy(kind: SyncKind, minutes: number) {
  const row = await db.query.syncRuns.findFirst({ where: and(sql`${syncRuns.kind} = ${kind}`, sql`${syncRuns.ok}`, gt(syncRuns.finishedAt, new Date(Date.now() - minutes * 60_000))) });
  return Boolean(row);
}
