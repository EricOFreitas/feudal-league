/** Teste local da lógica de torneio com jogadores reais e a partida 2v2 517326318 (Eric+CHACAL × Setrakian+KaneGB). */
import { db, matchMembers, tournaments, users } from '@aoe2/db';
import { addTeam, createTournament, detectTournamentGames, recordGame, setTeamSeed, startBracket, tournamentBySlug, undoLastGame } from '@aoe2/sync';
import { notInArray } from 'drizzle-orm';
import { eq } from 'drizzle-orm';

const user = await db.query.users.findFirst();
if (!user) throw new Error('sem usuário local');
const slug = `teste-2v2-${Date.now().toString(36)}`;
const id = (await createTournament({ slug, name: 'Teste 2v2', description: null, ownerUserId: user.id, teamSize: 2, bestOf: 1, finalBestOf: 3, groupCount: 0, advancePerGroup: 2, groupBestOf: 1, maxTeams: null, startsAt: null, maxPeakRating: 1100, minGames: 50, minRecentGames: null, prize: null }))!;
const show = async (label: string) => {
  const t = (await tournamentBySlug(slug))!;
  console.log(`\n== ${label}: status=${t.status}`);
  for (const m of t.matches) console.log(`  R${m.round}P${m.position} ${t.teams.find((x) => x.id === m.teamAId)?.name ?? '—'} ${m.scoreA}–${m.scoreB} ${t.teams.find((x) => x.id === m.teamBId)?.name ?? '—'} [${m.status}] winner=${t.teams.find((x) => x.id === m.winnerTeamId)?.name ?? '-'} games=${m.games.map((g) => `${g.source}:${g.matchId}`).join(',')}`);
};
console.log('A (Eric+CHACAL, sem skip):', JSON.stringify(await addTeam(id, { profileIds: [2966178, 23337133], status: 'confirmed' })));
const rA = await addTeam(id, { profileIds: [2966178, 23337133], status: 'confirmed', skipEligibility: true, name: 'Eric & CHACAL' });
const rB = await addTeam(id, { profileIds: [8525736, 5627652], status: 'confirmed', skipEligibility: true, name: 'Setrakian & KaneGB' });
console.log('A (skip):', JSON.stringify(rA), 'B:', JSON.stringify(rB));
console.log('C:', JSON.stringify(await addTeam(id, { profileIds: [8525736, 1], status: 'confirmed', skipEligibility: true })), '(repetido, deve falhar)');
const used = [2966178, 23337133, 8525736, 5627652];
const others = (await db.selectDistinct({ profileId: matchMembers.profileId }).from(matchMembers).where(notInArray(matchMembers.profileId, used)).limit(4)).map((r) => r.profileId);
console.log('outros perfis:', others);
const rC = await addTeam(id, { profileIds: [others[0]!, others[1]!], status: 'confirmed', skipEligibility: true, name: 'Time C' });
const rD = await addTeam(id, { profileIds: [others[2]!, others[3]!], status: 'confirmed', skipEligibility: true, name: 'Time D' });
console.log('C:', JSON.stringify(rC), 'D:', JSON.stringify(rD));
// seeds: A=1, B=4 → se enfrentam na R1P0; C=2, D=3 → R1P1
if (rA.ok) await setTeamSeed(rA.teamId, 1); if (rB.ok) await setTeamSeed(rB.teamId, 4);
if (rC.ok) await setTeamSeed(rC.teamId, 2); if (rD.ok) await setTeamSeed(rD.teamId, 3);
console.log('bracket:', JSON.stringify(await startBracket(id)));
await db.update(tournaments).set({ bracketAt: new Date('2026-10-29T00:00:00Z') }).where(eq(tournaments.id, id));
await show('após chave (A×B, C×D)');
console.log('detectados:', await detectTournamentGames());
await show('após detecção (B deve vencer A pela partida 517326318)');
let t = (await tournamentBySlug(slug))!;
const cd = t.matches.find((m) => m.round === 1 && m.position === 1)!;
console.log('C×D manual (Bo1):', await recordGame(cd.id, cd.teamAId!, { source: 'manual' }));
t = (await tournamentBySlug(slug))!;
const final = t.matches.find((m) => m.nextMatchId == null)!;
const bId = t.teams.find((x) => x.name === 'Setrakian & KaneGB')!.id;
console.log('final manual 1:', await recordGame(final.id, bId, { source: 'manual' }));
console.log('final manual 2:', await recordGame(final.id, bId, { source: 'manual' }));
await show('após 2 jogos manuais na final (Bo3 → B campeão, torneio encerrado)');
console.log('undo:', await undoLastGame(final.id));
await show('após desfazer (volta a running, 1–0)');
await db.delete(tournaments).where(eq(tournaments.id, id));
console.log('\nlimpo');
process.exit(0);
