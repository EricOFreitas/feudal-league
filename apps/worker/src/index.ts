/**
 * Worker de sincronização. Roda em loop; cada ciclo escolhe quem sincronizar por prioridade:
 *   - inscrito em liga com temporada aberta ou em torneio em andamento: a cada 15 min
 *   - trazido automaticamente pra liga (adversário) e não reivindicado: a cada 6 h
 *   - reivindicado (tem dono): a cada 60 min
 *   - só adicionado, visto nos últimos 30 dias: a cada 6 h
 * Jogador sem dono e sem visita recente não entra no ciclo; a página dele sincroniza sob demanda.
 * Antes de detectar, vira o mês da Liga Global. Depois de gravar partidas, detecta as de liga e de torneio,
 * apura o pódio do mês que acabou, tira o retrato semanal das posições, envia os avisos pendentes ao Discord
 * e registra cada etapa em sync_runs (página de status).
 * Depois lê a gravação das partidas de liga novas e guarda os números de treino (sem IA; docs/TREINO.md).
 * Em paralelo, a cada 10 s, processa a fila de análises de partida (replay → IA) e, a cada 30 s, lê os lobbies
 * abertos por quem está disponível pra treinar (só chama a API se alguém estiver).
 */
import { db, players } from '@aoe2/db';
import {
  activeLeagueProfileIds, activeTournamentProfileIds, autoJoinOpponents, autoLeagueProfileIds, awardMonthlyPodiums, closeIncident, collectLeagueMetrics, detectLeagueMatches, detectTournamentGames, openIncident,
  processNotifications, processQueuedAnalyses, purgeExpiredSparring, recordSyncRun, rollMonthlySeasons, syncMatchHistory, syncOpenLobbies, syncRatingsByProfileIds, takeWeeklySnapshots,
} from '@aoe2/sync';
import { and, gt, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm';

const ONCE = process.argv.includes('--once');
const CYCLE_MS = 5 * 60 * 1000;
const ANALYSIS_MS = 10 * 1000;
const LOBBY_MS = 30 * 1000;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

async function pickDue(): Promise<number[]> {
  const now = new Date();
  const m15 = new Date(now.getTime() - 15 * 60 * 1000);
  const h1 = new Date(now.getTime() - 60 * 60 * 1000);
  const h6 = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const inLeague = [...new Set([...(await activeLeagueProfileIds()), ...(await activeTournamentProfileIds())])];
  const autoIds = await autoLeagueProfileIds();
  const rows = await db
    .select({ profileId: players.profileId })
    .from(players)
    .where(
      or(
        inLeague.length ? and(inArray(players.profileId, inLeague), or(isNull(players.lastSyncedAt), lt(players.lastSyncedAt, m15))) : undefined,
        and(isNotNull(players.claimedByUserId), or(isNull(players.lastSyncedAt), lt(players.lastSyncedAt, h1))),
        and(isNull(players.claimedByUserId), gt(players.lastViewedAt, d30), or(isNull(players.lastSyncedAt), lt(players.lastSyncedAt, h6))),
        autoIds.length ? and(inArray(players.profileId, autoIds), or(isNull(players.lastSyncedAt), lt(players.lastSyncedAt, h6))) : undefined,
      ),
    )
    .limit(500);
  return rows.map((r) => r.profileId);
}

const API_INCIDENT = 'Servidor do jogo sem resposta';

async function cycle() {
  const t0 = new Date();
  const due = await pickDue();
  if (due.length === 0) { log('nada a sincronizar'); await recordSyncRun('league', t0, { players: 0 }); }
  else {
    log(`sincronizando ${due.length} jogadores`);
    try {
      const n = await syncRatingsByProfileIds(due);
      const { matches } = await syncMatchHistory(due);
      log(`ok: ${n} ratings, ${matches} partidas novas`);
      await recordSyncRun('league', t0, { players: due.length, matches });
      await closeIncident(API_INCIDENT);
    } catch (e) {
      const msg = (e as Error).message;
      await recordSyncRun('league', t0, { players: due.length, ok: false, error: msg });
      if (/HTTP 5\d\d|falha de rede|timeout/i.test(msg)) await openIncident(API_INCIDENT, msg.slice(0, 300), 'major');
      throw e;
    }
  }
  const t1 = new Date();
  if (await rollMonthlySeasons()) log('virada do mês: nova temporada da Liga Global');
  const league = await detectLeagueMatches();
  if (league) log(`${league} partidas de liga detectadas`);
  const games = await detectTournamentGames();
  if (games) log(`${games} jogos de torneio detectados`);
  await recordSyncRun('detect', t1, { matches: league + games });
  const medals = await awardMonthlyPodiums();
  if (medals) log(`${medals} medalhas do pódio do mês`);
  try {
    const auto = await autoJoinOpponents();
    if (auto) log(`${auto} adversários trazidos pra liga`);
  } catch (e) { log('erro no auto-join:', (e as Error).message); }
  const tm = new Date();
  try {
    const m = await collectLeagueMetrics();
    if (m.parsed || m.unavailable || m.failed) {
      log(`métricas de treino: ${m.parsed} gravações lidas, ${m.unavailable} indisponíveis, ${m.failed} falhas`);
      await recordSyncRun('metrics', tm, { matches: m.parsed });
    }
  } catch (e) {
    log('erro nas métricas de treino:', (e as Error).message);
    await recordSyncRun('metrics', tm, { ok: false, error: (e as Error).message });
  }
  const t2 = new Date();
  const snaps = await takeWeeklySnapshots();
  if (snaps) { log(`${snaps} posições fotografadas (semana)`); await recordSyncRun('snapshot', t2, { players: snaps }); }
  try { const purged = await purgeExpiredSparring(); if (purged) log(`${purged} disponibilidades de treino vencidas apagadas`); } catch (e) { log('erro na limpeza do treino:', (e as Error).message); }
  const t3 = new Date();
  try {
    const sent = await processNotifications();
    if (sent) log(`${sent} avisos enviados ao Discord`);
    await recordSyncRun('notify', t3, { matches: sent });
  } catch (e) {
    log('erro nos avisos:', (e as Error).message);
    await recordSyncRun('notify', t3, { ok: false, error: (e as Error).message });
  }
}

async function analysisLoop() {
  for (;;) {
    const t0 = new Date();
    try {
      const n = await processQueuedAnalyses();
      if (n) { log(`${n} análises processadas`); await recordSyncRun('analysis', t0, { matches: n }); }
    } catch (e) { log('erro nas análises:', (e as Error).message); await recordSyncRun('analysis', t0, { ok: false, error: (e as Error).message }).catch(() => undefined); }
    if (ONCE) return;
    await new Promise((r) => setTimeout(r, ANALYSIS_MS));
  }
}

async function lobbyLoop() {
  let last = -1;
  for (;;) {
    try {
      const n = await syncOpenLobbies();
      if (n !== last) { if (n || last > 0) log(`lobbies de treino abertos: ${n}`); last = n; }
    } catch (e) { log('erro nos lobbies:', (e as Error).message); }
    if (ONCE) return;
    await new Promise((r) => setTimeout(r, LOBBY_MS));
  }
}

const analyses = analysisLoop();
const lobbies = lobbyLoop();
for (;;) {
  try { await cycle(); } catch (e) { log('erro no ciclo:', (e as Error).message); }
  if (ONCE) break;
  await new Promise((r) => setTimeout(r, CYCLE_MS));
}
await analyses;
await lobbies;
process.exit(0);
