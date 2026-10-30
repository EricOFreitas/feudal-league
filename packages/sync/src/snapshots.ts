/**
 * Retrato semanal da classificação (gráfico "Evolução na temporada" no perfil).
 * O worker chama takeWeeklySnapshots() a cada ciclo; ela só grava se a última foto da temporada
 * tem 7 dias ou mais (ou se não há nenhuma). Idempotente dentro da semana.
 */
import { db, divisions, seasons, standingSnapshots } from '@aoe2/db';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { standings } from './leagues';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function takeWeeklySnapshots(): Promise<number> {
  const open = await db.query.seasons.findMany({ where: isNull(seasons.endedAt) });
  let n = 0;
  for (const season of open) {
    const last = await db.query.standingSnapshots.findFirst({ where: eq(standingSnapshots.seasonId, season.id), orderBy: [desc(standingSnapshots.capturedAt)] });
    if (last && Date.now() - last.capturedAt.getTime() < WEEK_MS) continue;
    const divs = await db.query.divisions.findMany({ where: eq(divisions.leagueId, season.leagueId), orderBy: [asc(divisions.sort)] });
    const capturedAt = new Date();
    for (const d of divs) {
      const table = await standings(season.id, d.id);
      if (table.length === 0) continue;
      await db.insert(standingSnapshots).values(table.map((r, i) => ({
        seasonId: season.id, divisionId: d.id, playerId: r.playerId, position: i + 1, total: table.length, points: r.points, wins: r.wins, losses: r.losses, capturedAt,
      })));
      n += table.length;
    }
  }
  return n;
}

/** Série semanal de um jogador numa temporada (posição, total, pontos), mais antiga primeiro. */
export async function snapshotSeries(playerId: number, seasonId: number) {
  return db.query.standingSnapshots.findMany({
    where: and(eq(standingSnapshots.playerId, playerId), eq(standingSnapshots.seasonId, seasonId)),
    orderBy: [asc(standingSnapshots.capturedAt)],
  });
}
