/**
 * Testa as métricas de treino (T1) numa partida 1v1 real, sem IA.
 *
 *   cd apps/worker && node --env-file-if-exists=../../.env --import tsx src/tools/test-metrics.ts <profileId> [matchId]
 *
 * Sem matchId: sincroniza o histórico do jogador e usa a 1v1 ranqueada mais recente. Exige o analyzer no ar.
 * Imprime os números dos dois jogadores, grava em match_metrics e mostra os benchmarks da liga do jogador.
 */
import { db, matches, matchMembers } from '@aoe2/db';
import { civName } from '@aoe2/aoe-api';
import { benchmarksForLeague, globalDivisionOf, metricsFromParse, parseReplay, storeMatchMetrics, syncMatchHistory } from '@aoe2/sync';
import { desc, eq, inArray, sql } from 'drizzle-orm';

const [profileIdS, matchIdS] = process.argv.slice(2);
const profileId = Number(profileIdS);
if (!profileId) { console.error('uso: test-metrics.ts <profileId> [matchId]'); process.exit(1); }

let matchId = Number(matchIdS) || 0;
if (!matchId) {
  await syncMatchHistory([profileId]);
  const mine = db.select({ id: matchMembers.matchId }).from(matchMembers).where(eq(matchMembers.profileId, profileId));
  const [m] = await db.select({ id: matches.id, completedAt: matches.completedAt, n: sql<number>`(select count(*) from match_members mm where mm.match_id = ${matches.id})::int` })
    .from(matches).where(inArray(matches.id, mine)).orderBy(desc(matches.completedAt)).limit(20);
  if (!m) throw new Error('sem partidas');
  const rows = await db.select({ id: matches.id, completedAt: matches.completedAt }).from(matches).where(inArray(matches.id, mine)).orderBy(desc(matches.completedAt)).limit(20);
  for (const r of rows) {
    const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(matchMembers).where(eq(matchMembers.matchId, r.id));
    if (c?.n === 2) { matchId = r.id; break; }
  }
  if (!matchId) throw new Error('nenhuma 1v1 recente');
}
const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId), with: { members: true } });
if (!match) throw new Error('partida não encontrada');
const ids = [profileId, ...match.members.map((m) => m.profileId).filter((p) => p !== profileId)];
console.log(`partida ${matchId} (${match.completedAt.toISOString()}, ${match.mapName}), jogadores ${ids.join(' vs ')}`);

const t0 = Date.now();
const parse = await parseReplay(matchId, ids, Object.fromEntries(match.members.map((m) => [m.profileId, civName(m.civId)])));
console.log(`parse em ${Date.now() - t0} ms, duração ${parse.duration_s}s, header_ok=${parse.header_ok}, slots=${JSON.stringify(parse.slots)}`);
for (const pid of ids) {
  const m = metricsFromParse(parse, pid);
  const alias = match.members.find((x) => x.profileId === pid)?.alias;
  console.log(`\n${alias ?? pid} (${pid}):`, m);
}
const divisions = await globalDivisionOf(ids);
const n = await storeMatchMetrics({ id: match.id, completedAt: match.completedAt, profileIds: ids }, parse, 'analysis', divisions);
console.log(`\n${n} linhas gravadas em match_metrics; divisões: ${JSON.stringify([...divisions])}`);
const divisionId = divisions.get(profileId);
if (divisionId) {
  const leagueRow = await db.execute(sql`select league_id from divisions where id = ${divisionId}`);
  const leagueId = (leagueRow[0] as { league_id: number }).league_id;
  const bench = await benchmarksForLeague(leagueId);
  console.log('\nbenchmarks da liga:', JSON.stringify([...bench.values()], null, 1));
}
process.exit(0);
