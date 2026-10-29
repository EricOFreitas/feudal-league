/**
 * Worker de sincronização. Roda em loop; cada ciclo escolhe quem sincronizar por prioridade:
 *   - inscrito em liga com temporada aberta: a cada 15 min
 *   - reivindicado (tem dono): a cada 60 min
 *   - só adicionado, visto nos últimos 30 dias: a cada 6 h
 * Jogador sem dono e sem visita recente não entra no ciclo; a página dele sincroniza sob demanda.
 * Depois de gravar partidas, detecta as de liga (1v1 entre membros da mesma divisão).
 */
import { db, players } from '@aoe2/db';
import { activeLeagueProfileIds, detectLeagueMatches, syncMatchHistory, syncRatingsByProfileIds } from '@aoe2/sync';
import { and, gt, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm';

const ONCE = process.argv.includes('--once');
const CYCLE_MS = 5 * 60 * 1000;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

async function pickDue(): Promise<number[]> {
  const now = new Date();
  const m15 = new Date(now.getTime() - 15 * 60 * 1000);
  const h1 = new Date(now.getTime() - 60 * 60 * 1000);
  const h6 = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const inLeague = await activeLeagueProfileIds();
  const rows = await db
    .select({ profileId: players.profileId })
    .from(players)
    .where(
      or(
        inLeague.length ? and(inArray(players.profileId, inLeague), or(isNull(players.lastSyncedAt), lt(players.lastSyncedAt, m15))) : undefined,
        and(isNotNull(players.claimedByUserId), or(isNull(players.lastSyncedAt), lt(players.lastSyncedAt, h1))),
        and(isNull(players.claimedByUserId), gt(players.lastViewedAt, d30), or(isNull(players.lastSyncedAt), lt(players.lastSyncedAt, h6))),
      ),
    )
    .limit(500);
  return rows.map((r) => r.profileId);
}

async function cycle() {
  const due = await pickDue();
  if (due.length === 0) { log('nada a sincronizar'); }
  else {
    log(`sincronizando ${due.length} jogadores`);
    const n = await syncRatingsByProfileIds(due);
    const { matches } = await syncMatchHistory(due);
    log(`ok: ${n} ratings, ${matches} partidas novas`);
  }
  const league = await detectLeagueMatches();
  if (league) log(`${league} partidas de liga detectadas`);
}

for (;;) {
  try { await cycle(); } catch (e) { log('erro no ciclo:', (e as Error).message); }
  if (ONCE) break;
  await new Promise((r) => setTimeout(r, CYCLE_MS));
}
process.exit(0);
