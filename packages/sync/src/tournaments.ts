/**
 * Torneios (fase 3): times de 1 a 4, fase de grupos opcional, mata-mata por eliminação simples,
 * melhor de 1/3/5. Resultado confirmado pelo histórico ou reportado pelo organizador.
 * Grupos podem ser "jogar todos" (group_play_all): o confronto só fecha depois dos N jogos e cada jogo vale 1 ponto.
 */
import { RM_1V1 } from '@aoe2/aoe-api';
import { db, matches, matchMembers, playerRatings, players, tournamentGames, tournamentImages, tournamentMatches, tournamentTeamMembers, tournamentTeams, tournaments, type Tournament, type TournamentMatch, type TournamentTeam } from '@aoe2/db';
import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { findPlayerByProfileId, importPlayerByProfileId } from './players';

export const TEAM_SIZES = [1, 2, 3, 4] as const;
export const BEST_OFS = [1, 3, 5] as const;

/** Configurações que o organizador escolhe (criar e editar). */
export type TournamentSettings = {
  name: string; description: string | null; organizerName: string | null; organizerUrl: string | null; registrationClosed: boolean;
  teamSize: number; bestOf: number; finalBestOf: number | null; groupCount: number; advancePerGroup: number; groupBestOf: number; groupPlayAll: boolean;
  maxTeams: number | null; startsAt: Date | null;
  maxPeakRating: number | null; minGames: number | null; minRecentGames: number | null; prize: string | null;
};

export type NewTournamentInput = TournamentSettings & { slug: string; ownerUserId: number; leagueId?: number | null };

export async function createTournament(input: NewTournamentInput): Promise<number | null> {
  const [row] = await db.insert(tournaments).values({
    slug: input.slug, name: input.name, description: input.description, ownerUserId: input.ownerUserId, leagueId: input.leagueId ?? null,
    organizerName: input.organizerName, organizerUrl: input.organizerUrl, registrationClosed: input.registrationClosed,
    teamSize: input.teamSize, format: input.groupCount > 0 ? 'groups_elim' : 'single_elim', bestOf: input.bestOf, finalBestOf: input.finalBestOf,
    groupCount: input.groupCount, advancePerGroup: input.advancePerGroup, groupBestOf: input.groupBestOf, groupPlayAll: input.groupPlayAll,
    maxTeams: input.maxTeams, startsAt: input.startsAt,
    maxPeakRating: input.maxPeakRating, minGames: input.minGames, minRecentGames: input.minRecentGames, prize: input.prize,
  }).onConflictDoNothing().returning({ id: tournaments.id });
  return row?.id ?? null;
}

export type UpdateTournamentResult = { ok: true } | { ok: false; reason: 'status' | 'max_teams' };

/**
 * Edita o torneio. Nome, descrição, premiação e início mudam até o fim. O resto (formato, tamanho, requisitos)
 * só com inscrições abertas; o tamanho do time só enquanto não há time inscrito.
 */
export async function updateTournament(tournamentId: number, input: TournamentSettings): Promise<UpdateTournamentResult> {
  const t = await db.query.tournaments.findFirst({ where: eq(tournaments.id, tournamentId), with: { teams: { columns: { id: true, status: true } } } });
  if (!t || t.status === 'finished' || t.status === 'cancelled') return { ok: false, reason: 'status' };
  const text = { name: input.name, description: input.description, organizerName: input.organizerName, organizerUrl: input.organizerUrl, prize: input.prize, startsAt: input.startsAt };
  if (t.status !== 'open') {
    await db.update(tournaments).set(text).where(eq(tournaments.id, tournamentId));
    return { ok: true };
  }
  const active = t.teams.filter((x) => x.status !== 'withdrawn').length;
  if (input.maxTeams != null && input.maxTeams < active) return { ok: false, reason: 'max_teams' };
  await db.update(tournaments).set({
    ...text,
    registrationClosed: input.registrationClosed,
    teamSize: active > 0 ? t.teamSize : input.teamSize,
    format: input.groupCount > 0 ? 'groups_elim' : 'single_elim', bestOf: input.bestOf, finalBestOf: input.finalBestOf,
    groupCount: input.groupCount, advancePerGroup: input.advancePerGroup, groupBestOf: input.groupBestOf, groupPlayAll: input.groupPlayAll,
    maxTeams: input.maxTeams, maxPeakRating: input.maxPeakRating, minGames: input.minGames, minRecentGames: input.minRecentGames,
  }).where(eq(tournaments.id, tournamentId));
  return { ok: true };
}

/* ───────────────────────────── imagem ───────────────────────────── */

export const TOURNAMENT_IMAGE_MAX_BYTES = 1024 * 1024;

/** Tipo da imagem pelos primeiros bytes (não pela extensão). Só PNG, JPEG e WebP; SVG fica de fora. */
export function imageTypeOf(buf: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && String.fromCharCode(...buf.slice(0, 4)) === 'RIFF' && String.fromCharCode(...buf.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

export async function setTournamentImage(tournamentId: number, data: Buffer): Promise<{ ok: true } | { ok: false; reason: 'image' }> {
  const contentType = imageTypeOf(data);
  if (!contentType || data.length > TOURNAMENT_IMAGE_MAX_BYTES) return { ok: false, reason: 'image' };
  const updatedAt = new Date();
  await db.insert(tournamentImages).values({ tournamentId, contentType, data, updatedAt })
    .onConflictDoUpdate({ target: tournamentImages.tournamentId, set: { contentType, data, updatedAt } });
  return { ok: true };
}

export async function deleteTournamentImage(tournamentId: number) {
  await db.delete(tournamentImages).where(eq(tournamentImages.tournamentId, tournamentId));
}

/** Só a data da imagem (sem os bytes): serve pra saber se existe e pra versionar a URL. */
export async function tournamentImageVersion(tournamentId: number): Promise<number | null> {
  const [r] = await db.select({ updatedAt: tournamentImages.updatedAt }).from(tournamentImages).where(eq(tournamentImages.tournamentId, tournamentId));
  return r ? r.updatedAt.getTime() : null;
}

export async function tournamentImage(tournamentId: number) {
  return (await db.query.tournamentImages.findFirst({ where: eq(tournamentImages.tournamentId, tournamentId) })) ?? null;
}

/** Status pra exibir: inscrições encerradas antes de começar viram 'closed'. */
export function tournamentStatusKey(t: Pick<Tournament, 'status' | 'registrationClosed'>): 'open' | 'closed' | 'groups' | 'running' | 'finished' | 'cancelled' {
  if (t.status === 'open' && t.registrationClosed) return 'closed';
  return t.status as 'open' | 'groups' | 'running' | 'finished' | 'cancelled';
}

export async function listTournaments() {
  return db.query.tournaments.findMany({
    where: sql`${tournaments.status} <> 'cancelled'`,
    orderBy: [desc(tournaments.createdAt)],
    with: { teams: { columns: { id: true, status: true } } },
  });
}

/** Torneio completo: times com jogadores, confrontos com jogos. */
export async function tournamentBySlug(slug: string) {
  return db.query.tournaments.findFirst({
    where: eq(tournaments.slug, slug),
    with: {
      teams: { with: { members: { with: { player: { columns: { id: true, profileId: true, alias: true, country: true, claimedByUserId: true } } } } }, orderBy: [asc(tournamentTeams.createdAt)] },
      matches: { with: { games: { orderBy: [asc(tournamentGames.playedAt)] } }, orderBy: [asc(tournamentMatches.stage), asc(tournamentMatches.round), asc(tournamentMatches.position)] },
    },
  });
}
export type TournamentFull = NonNullable<Awaited<ReturnType<typeof tournamentBySlug>>>;
export type TeamFull = TournamentFull['teams'][number];
export type MatchFull = TournamentFull['matches'][number];

/* ───────────────────────────── elegibilidade ───────────────────────────── */

export type Eligibility = {
  ok: boolean;
  peak: number | null; games: number; recent: number;
  fails: ('peak' | 'games' | 'recent' | 'no_rating')[];
};

/** Checa os requisitos do torneio pra um jogador (ladder RM 1v1). */
export async function eligibilityOf(t: Pick<Tournament, 'maxPeakRating' | 'minGames' | 'minRecentGames'>, playerId: number): Promise<Eligibility> {
  const p = await db.query.players.findFirst({ where: eq(players.id, playerId), with: { ratings: true } });
  const r = p?.ratings.find((x) => x.leaderboardId === RM_1V1);
  const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [rec] = p ? await db.select({ n: sql<number>`count(*)::int` }).from(matchMembers).innerJoin(matches, eq(matches.id, matchMembers.matchId))
    .where(and(eq(matchMembers.profileId, p.profileId), gt(matches.completedAt, d30))) : [{ n: 0 }];
  const games = r ? r.wins + r.losses : 0;
  const fails: Eligibility['fails'] = [];
  const needsRating = t.maxPeakRating != null || t.minGames != null;
  if (needsRating && !r) fails.push('no_rating');
  if (r && t.maxPeakRating != null && Math.max(r.rating, r.highestRating) > t.maxPeakRating) fails.push('peak');
  if (t.minGames != null && games < t.minGames) fails.push('games');
  if (t.minRecentGames != null && (rec?.n ?? 0) < t.minRecentGames) fails.push('recent');
  return { ok: fails.length === 0, peak: r ? Math.max(r.rating, r.highestRating) : null, games, recent: rec?.n ?? 0, fails };
}

/* ───────────────────────────── inscrição ───────────────────────────── */

export type AddTeamReason = 'closed' | 'full' | 'size' | 'player_taken' | 'player_missing' | 'duplicate' | 'ineligible';
export type AddTeamResult = { ok: true; teamId: number } | { ok: false; reason: AddTeamReason; profileId?: number; eligibility?: Eligibility };

export async function addTeam(tournamentId: number, input: { name?: string | null; profileIds: number[]; byUserId?: number | null; status: 'pending' | 'confirmed'; captainProfileId?: number | null; skipEligibility?: boolean }): Promise<AddTeamResult> {
  const t = await db.query.tournaments.findFirst({ where: eq(tournaments.id, tournamentId), with: { teams: { columns: { id: true, status: true } } } });
  if (!t || t.status !== 'open') return { ok: false, reason: 'closed' };
  // inscrições encerradas: só o organizador (times já confirmados) ainda adiciona
  if (t.registrationClosed && input.status === 'pending') return { ok: false, reason: 'closed' };
  const ids = [...new Set(input.profileIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length !== input.profileIds.length) return { ok: false, reason: 'duplicate' };
  if (ids.length !== t.teamSize) return { ok: false, reason: 'size' };
  if (t.maxTeams && t.teams.filter((x) => x.status !== 'withdrawn').length >= t.maxTeams) return { ok: false, reason: 'full' };

  const playerIds: number[] = [];
  const aliases: string[] = [];
  for (const pid of ids) {
    let p = await findPlayerByProfileId(pid);
    if (!p) {
      try { await importPlayerByProfileId(pid); } catch { /* API fora: trata como ausente */ }
      p = await findPlayerByProfileId(pid);
    }
    if (!p) return { ok: false, reason: 'player_missing', profileId: pid };
    if (!input.skipEligibility) {
      const e = await eligibilityOf(t, p.id);
      if (!e.ok) return { ok: false, reason: 'ineligible', profileId: pid, eligibility: e };
    }
    playerIds.push(p.id); aliases.push(p.alias);
  }
  const taken = await db.select({ playerId: tournamentTeamMembers.playerId }).from(tournamentTeamMembers)
    .innerJoin(tournamentTeams, eq(tournamentTeams.id, tournamentTeamMembers.teamId))
    .where(and(eq(tournamentTeamMembers.tournamentId, tournamentId), inArray(tournamentTeamMembers.playerId, playerIds), sql`${tournamentTeams.status} <> 'withdrawn'`));
  if (taken.length) {
    const i = playerIds.indexOf(taken[0]!.playerId);
    return { ok: false, reason: 'player_taken', profileId: ids[i] };
  }
  const name = (input.name ?? '').trim().slice(0, 60) || aliases.join(' & ');
  const [team] = await db.insert(tournamentTeams).values({ tournamentId, name, status: input.status, createdByUserId: input.byUserId ?? null }).returning({ id: tournamentTeams.id });
  // capitão só quando indicado (inscrição pela própria dupla); o organizador cadastra sem capitão
  await db.insert(tournamentTeamMembers).values(playerIds.map((playerId, i) => ({ teamId: team!.id, tournamentId, playerId, isCaptain: input.captainProfileId != null && ids[i] === input.captainProfileId })));
  return { ok: true, teamId: team!.id };
}

export async function setTeamStatus(teamId: number, status: 'pending' | 'confirmed' | 'withdrawn') {
  await db.update(tournamentTeams).set({ status }).where(eq(tournamentTeams.id, teamId));
}
export async function deleteTeam(teamId: number) {
  await db.delete(tournamentTeams).where(eq(tournamentTeams.id, teamId));
}
export async function setTeamSeed(teamId: number, seed: number | null) {
  await db.update(tournamentTeams).set({ seed }).where(eq(tournamentTeams.id, teamId));
}

/* ───────────────────────────── fase de grupos ───────────────────────────── */

function shuffle<T>(a: T[]): T[] {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j]!, x[i]!]; }
  return x;
}

/** Ordena times confirmados: seed definido primeiro (crescente), o resto embaralhado. */
function orderedTeams(teams: TournamentTeam[]) {
  const seeded = teams.filter((t) => t.seed != null).sort((a, b) => a.seed! - b.seed!);
  return [...seeded, ...shuffle(teams.filter((t) => t.seed == null))];
}

/** Pontos corridos (método do círculo). Devolve rodadas de pares [a, b]; null = folga. */
export function roundRobin<T>(items: T[]): [T, T][][] {
  const list: (T | null)[] = [...items];
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds: [T, T][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: [T, T][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i]!, b = list[n - 1 - i]!;
      if (a != null && b != null) round.push([a, b]);
    }
    rounds.push(round);
    list.splice(1, 0, list.pop()!); // gira todos menos o primeiro
  }
  return rounds;
}

export async function startGroups(tournamentId: number): Promise<{ ok: true } | { ok: false; reason: 'status' | 'few_teams' | 'no_groups' }> {
  const t = await db.query.tournaments.findFirst({ where: eq(tournaments.id, tournamentId), with: { teams: true } });
  if (!t || t.status !== 'open') return { ok: false, reason: 'status' };
  if (t.groupCount < 1) return { ok: false, reason: 'no_groups' };
  const teams = orderedTeams(t.teams.filter((x) => x.status === 'confirmed'));
  if (teams.length < t.groupCount * 2) return { ok: false, reason: 'few_teams' };
  // distribuição em serpentina: 1→A, 2→B, 3→C, 4→C, 5→B, 6→A…
  const groups: TournamentTeam[][] = Array.from({ length: t.groupCount }, () => []);
  teams.forEach((team, i) => {
    const lap = Math.floor(i / t.groupCount);
    const idx = lap % 2 === 0 ? i % t.groupCount : t.groupCount - 1 - (i % t.groupCount);
    groups[idx]!.push(team);
  });
  await db.transaction(async (tx) => {
    // posição única no torneio inteiro: o índice (torneio, stage, rodada, posição) não inclui o grupo
    let pos = 0;
    for (const [gi, g] of groups.entries()) {
      const groupNo = gi + 1;
      for (const team of g) await tx.update(tournamentTeams).set({ groupNo }).where(eq(tournamentTeams.id, team.id));
      const rounds = roundRobin(g);
      for (const [ri, round] of rounds.entries()) {
        for (const [a, b] of round) {
          await tx.insert(tournamentMatches).values({ tournamentId, stage: 'group', groupNo, round: ri + 1, position: pos++, teamAId: a.id, teamBId: b.id, bestOf: t.groupBestOf, status: 'ready' });
        }
      }
    }
    await tx.update(tournaments).set({ status: 'groups', bracketAt: new Date() }).where(eq(tournaments.id, tournamentId));
  });
  return { ok: true };
}

/**
 * Refaz o sorteio dos grupos: só na fase de grupos e enquanto nenhum jogo foi registrado (detectado ou manual).
 * Apaga os confrontos de grupo, tira os times dos grupos e sorteia de novo com a mesma regra de startGroups.
 */
export async function redrawGroups(tournamentId: number): Promise<{ ok: true } | { ok: false; reason: 'status' | 'has_games' | 'few_teams' | 'no_groups' }> {
  const t = await db.query.tournaments.findFirst({ where: eq(tournaments.id, tournamentId) });
  if (!t || t.status !== 'groups') return { ok: false, reason: 'status' };
  const [played] = await db.select({ n: sql<number>`count(*)::int` }).from(tournamentGames)
    .innerJoin(tournamentMatches, eq(tournamentMatches.id, tournamentGames.tournamentMatchId))
    .where(eq(tournamentMatches.tournamentId, tournamentId));
  if ((played?.n ?? 0) > 0) return { ok: false, reason: 'has_games' };
  await db.transaction(async (tx) => {
    await tx.delete(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, tournamentId), eq(tournamentMatches.stage, 'group')));
    await tx.update(tournamentTeams).set({ groupNo: null }).where(eq(tournamentTeams.tournamentId, tournamentId));
    await tx.update(tournaments).set({ status: 'open', bracketAt: null }).where(eq(tournaments.id, tournamentId));
  });
  return startGroups(tournamentId);
}

export type GroupRow = { teamId: number; played: number; wins: number; losses: number; gamesWon: number; gamesLost: number; points: number };

/**
 * Classificação de cada grupo. Normal: vitória no confronto vale 3 pts. "Jogar todos": cada jogo vencido vale 1 pt,
 * contado já durante o confronto. Desempate: confrontos vencidos, saldo de jogos, jogos ganhos.
 */
export function groupStandings(t: TournamentFull): Map<number, GroupRow[]> {
  const out = new Map<number, GroupRow[]>();
  for (const team of t.teams) {
    if (team.groupNo == null || team.status === 'withdrawn') continue;
    if (!out.has(team.groupNo)) out.set(team.groupNo, []);
    out.get(team.groupNo)!.push({ teamId: team.id, played: 0, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, points: 0 });
  }
  for (const m of t.matches) {
    if (m.stage !== 'group' || m.groupNo == null || !m.teamAId || !m.teamBId) continue;
    const rows = out.get(m.groupNo); if (!rows) continue;
    const a = rows.find((r) => r.teamId === m.teamAId), b = rows.find((r) => r.teamId === m.teamBId);
    if (!a || !b) continue;
    a.gamesWon += m.scoreA; a.gamesLost += m.scoreB; b.gamesWon += m.scoreB; b.gamesLost += m.scoreA;
    if (m.status === 'done' || m.status === 'walkover') {
      a.played++; b.played++;
      if (m.winnerTeamId === a.teamId) { a.wins++; a.points += 3; b.losses++; } else if (m.winnerTeamId === b.teamId) { b.wins++; b.points += 3; a.losses++; }
    }
  }
  if (t.groupPlayAll) for (const rows of out.values()) for (const r of rows) r.points = r.gamesWon;
  for (const rows of out.values()) rows.sort((x, y) => y.points - x.points || y.wins - x.wins || (y.gamesWon - y.gamesLost) - (x.gamesWon - x.gamesLost) || y.gamesWon - x.gamesWon);
  return out;
}

/* ───────────────────────────── chave ───────────────────────────── */

/** Confrontos da 1ª rodada entre times do mesmo grupo, na chave montada a partir de `ordered` (seeds 1..n). */
function sameGroupClashes(ordered: TournamentTeam[]): number {
  const size = 2 ** Math.ceil(Math.log2(Math.max(ordered.length, 2)));
  const order = seedOrder(size).map((seed) => ordered[seed - 1] ?? null);
  let n = 0;
  for (let p = 0; p < order.length; p += 2) {
    const a = order[p], b = order[p + 1];
    if (a && b && a.groupNo != null && a.groupNo === b.groupNo) n++;
  }
  return n;
}

/**
 * Seeds da chave depois dos grupos: primeiros colocados no topo, depois os segundos, e assim por diante.
 * Cada colocação (a partir da 2ª) pode entrar na ordem dos grupos ou invertida; fica a combinação com menos
 * confrontos entre times do mesmo grupo na 1ª rodada. Com 2 grupos, 1º A × 2º B e 1º B × 2º A; com 3, a inversão.
 */
export function crossGroupsOrder(byPlace: TournamentTeam[][]): TournamentTeam[] {
  let best: TournamentTeam[] | null = null, bestScore = Infinity;
  const combos = 2 ** Math.max(0, byPlace.length - 1);
  for (let mask = 0; mask < combos; mask++) {
    const cand = byPlace.flatMap((teams, place) => (place > 0 && (mask >> (place - 1)) & 1 ? [...teams].reverse() : teams));
    const score = sameGroupClashes(cand);
    if (score < bestScore) { best = cand; bestScore = score; }
  }
  return best ?? [];
}

/** Ordem padrão de seeds numa chave de n posições: [1, n, n/2, n/2+1, …]. */
export function seedOrder(n: number): number[] {
  let arr = [1];
  while (arr.length < n) { const m = arr.length * 2; arr = arr.flatMap((s) => [s, m + 1 - s]); }
  return arr;
}

export async function startBracket(tournamentId: number): Promise<{ ok: true } | { ok: false; reason: 'status' | 'few_teams' | 'groups_open' }> {
  const full = await db.query.tournaments.findFirst({ where: eq(tournaments.id, tournamentId), with: { teams: true, matches: true } });
  if (!full) return { ok: false, reason: 'status' };
  let ordered: TournamentTeam[];
  if (full.status === 'open') {
    if (full.groupCount > 0) return { ok: false, reason: 'status' };
    ordered = orderedTeams(full.teams.filter((x) => x.status === 'confirmed'));
  } else if (full.status === 'groups') {
    if (full.matches.some((m) => m.stage === 'group' && m.status !== 'done' && m.status !== 'walkover')) return { ok: false, reason: 'groups_open' };
    const tf = await tournamentBySlug(full.slug);
    const standings = groupStandings(tf!);
    const byPlace: TournamentTeam[][] = [];
    for (const [groupNo, rows] of [...standings.entries()].sort((a, b) => a[0] - b[0])) {
      rows.slice(0, full.advancePerGroup).forEach((r, place) => {
        (byPlace[place] ??= []).push(full.teams.find((t) => t.id === r.teamId)!);
      });
      void groupNo;
    }
    ordered = crossGroupsOrder(byPlace);
  } else return { ok: false, reason: 'status' };
  if (ordered.length < 2) return { ok: false, reason: 'few_teams' };

  const size = 2 ** Math.ceil(Math.log2(ordered.length));
  const rounds = Math.log2(size);
  const order = seedOrder(size).map((seed) => ordered[seed - 1] ?? null);
  await db.transaction(async (tx) => {
    // cria da final pra trás pra ter os ids dos próximos confrontos
    const idsByRound: number[][] = [];
    for (let r = rounds; r >= 1; r--) {
      const count = size / 2 ** r;
      const ids: number[] = [];
      for (let p = 0; p < count; p++) {
        const next = r === rounds ? null : idsByRound[0]![Math.floor(p / 2)]!;
        const isFinal = r === rounds;
        const [row] = await tx.insert(tournamentMatches).values({
          tournamentId, stage: 'bracket', round: r, position: p, bestOf: isFinal ? (full.finalBestOf ?? full.bestOf) : full.bestOf,
          nextMatchId: next, nextSlot: next == null ? null : p % 2 === 0 ? 'a' : 'b', status: 'pending',
        }).returning({ id: tournamentMatches.id });
        ids.push(row!.id);
      }
      idsByRound.unshift(ids);
    }
    const first = idsByRound[0]!;
    for (let p = 0; p < first.length; p++) {
      const a = order[p * 2] ?? null, b = order[p * 2 + 1] ?? null;
      await tx.update(tournamentMatches).set({ teamAId: a?.id ?? null, teamBId: b?.id ?? null, status: a && b ? 'ready' : 'pending' }).where(eq(tournamentMatches.id, first[p]!));
    }
    await tx.update(tournaments).set({ status: 'running', bracketAt: full.bracketAt ?? new Date() }).where(eq(tournaments.id, tournamentId));
  });
  // byes: avança quem está sozinho
  const r1 = await db.query.tournamentMatches.findMany({ where: and(eq(tournamentMatches.tournamentId, tournamentId), eq(tournamentMatches.stage, 'bracket'), eq(tournamentMatches.round, 1)) });
  for (const m of r1) {
    if ((m.teamAId == null) !== (m.teamBId == null)) await finishMatch(m, (m.teamAId ?? m.teamBId)!, 'walkover');
  }
  return { ok: true };
}

async function finishMatch(m: TournamentMatch, winnerTeamId: number, status: 'done' | 'walkover' = 'done') {
  await db.update(tournamentMatches).set({ winnerTeamId, status }).where(eq(tournamentMatches.id, m.id));
  if (m.stage === 'group') {
    const open = await db.query.tournamentMatches.findFirst({ where: and(eq(tournamentMatches.tournamentId, m.tournamentId), eq(tournamentMatches.stage, 'group'), inArray(tournamentMatches.status, ['pending', 'ready'])) });
    void open; // a chave é gerada pelo organizador quando os grupos acabam
    return;
  }
  if (m.nextMatchId) {
    const next = await db.query.tournamentMatches.findFirst({ where: eq(tournamentMatches.id, m.nextMatchId) });
    if (next) {
      const patch = m.nextSlot === 'a' ? { teamAId: winnerTeamId } : { teamBId: winnerTeamId };
      const a = m.nextSlot === 'a' ? winnerTeamId : next.teamAId, b = m.nextSlot === 'b' ? winnerTeamId : next.teamBId;
      await db.update(tournamentMatches).set({ ...patch, status: a && b ? 'ready' : 'pending' }).where(eq(tournamentMatches.id, next.id));
    }
  } else {
    await db.update(tournaments).set({ status: 'finished', finishedAt: new Date() }).where(eq(tournaments.id, m.tournamentId));
  }
}

/** Registra um jogo e fecha o confronto se alguém alcançou a maioria (ou, nos grupos "jogar todos", depois dos N jogos). */
export async function recordGame(tournamentMatchId: number, winnerTeamId: number, opts: { matchId?: number | null; source: 'auto' | 'manual'; byUserId?: number | null; playedAt?: Date }) {
  const m = await db.query.tournamentMatches.findFirst({ where: eq(tournamentMatches.id, tournamentMatchId) });
  if (!m || m.status !== 'ready' || (winnerTeamId !== m.teamAId && winnerTeamId !== m.teamBId)) return false;
  const inserted = await db.insert(tournamentGames).values({ tournamentMatchId, winnerTeamId, matchId: opts.matchId ?? null, source: opts.source, reportedByUserId: opts.byUserId ?? null, playedAt: opts.playedAt ?? new Date() })
    .onConflictDoNothing().returning({ id: tournamentGames.id });
  if (inserted.length === 0) return false;
  const scoreA = m.scoreA + (winnerTeamId === m.teamAId ? 1 : 0);
  const scoreB = m.scoreB + (winnerTeamId === m.teamBId ? 1 : 0);
  await db.update(tournamentMatches).set({ scoreA, scoreB }).where(eq(tournamentMatches.id, m.id));
  const playAll = m.stage === 'group' && (await db.query.tournaments.findFirst({ where: eq(tournaments.id, m.tournamentId), columns: { groupPlayAll: true } }))?.groupPlayAll === true;
  if (playAll) {
    // melhor de N é sempre ímpar (BEST_OFS), então depois dos N jogos sempre há vencedor
    if (scoreA + scoreB >= m.bestOf) await finishMatch({ ...m, scoreA, scoreB }, scoreA > scoreB ? m.teamAId! : m.teamBId!);
    return true;
  }
  const need = Math.floor(m.bestOf / 2) + 1;
  if (scoreA >= need || scoreB >= need) await finishMatch({ ...m, scoreA, scoreB }, scoreA >= need ? m.teamAId! : m.teamBId!);
  return true;
}

/** Desfaz o último jogo. Se o confronto já tinha fechado, reabre e tira o vencedor do próximo (se este ainda não jogou). */
export async function undoLastGame(tournamentMatchId: number): Promise<boolean> {
  const m = await db.query.tournamentMatches.findFirst({ where: eq(tournamentMatches.id, tournamentMatchId), with: { games: { orderBy: [desc(tournamentGames.playedAt)] } } });
  if (!m || m.games.length === 0) return false;
  if (m.status === 'done' && m.nextMatchId) {
    const next = await db.query.tournamentMatches.findFirst({ where: eq(tournamentMatches.id, m.nextMatchId), with: { games: true } });
    if (next && (next.games.length > 0 || next.status === 'done')) return false;
    if (next) await db.update(tournamentMatches).set({ ...(m.nextSlot === 'a' ? { teamAId: null } : { teamBId: null }), status: 'pending' }).where(eq(tournamentMatches.id, next.id));
  }
  const last = m.games[0]!;
  await db.delete(tournamentGames).where(eq(tournamentGames.id, last.id));
  const scoreA = m.scoreA - (last.winnerTeamId === m.teamAId ? 1 : 0);
  const scoreB = m.scoreB - (last.winnerTeamId === m.teamBId ? 1 : 0);
  await db.update(tournamentMatches).set({ scoreA, scoreB, winnerTeamId: null, status: 'ready' }).where(eq(tournamentMatches.id, m.id));
  if (m.status === 'done' && !m.nextMatchId && m.stage === 'bracket') await db.update(tournaments).set({ status: 'running', finishedAt: null }).where(eq(tournaments.id, m.tournamentId));
  return true;
}

/* ───────────────────────────── detecção ───────────────────────────── */

/** Jogadores de times confirmados em torneios em andamento: sincronizam com prioridade. */
export async function activeTournamentProfileIds(): Promise<number[]> {
  const rows = await db.selectDistinct({ profileId: players.profileId }).from(tournamentTeamMembers)
    .innerJoin(tournamentTeams, eq(tournamentTeams.id, tournamentTeamMembers.teamId))
    .innerJoin(tournaments, eq(tournaments.id, tournamentTeamMembers.tournamentId))
    .innerJoin(players, eq(players.id, tournamentTeamMembers.playerId))
    .where(and(eq(tournamentTeams.status, 'confirmed'), inArray(tournaments.status, ['open', 'groups', 'running'])));
  return rows.map((r) => r.profileId);
}

/**
 * Procura, nos confrontos prontos, partidas do histórico com exatamente os jogadores dos dois times,
 * separados nos times certos, jogadas depois da geração da chave/grupos. Idempotente.
 */
export async function detectTournamentGames(): Promise<number> {
  const running = await db.query.tournaments.findMany({ where: inArray(tournaments.status, ['groups', 'running']), with: { teams: { with: { members: { with: { player: { columns: { profileId: true } } } } } } } });
  let found = 0;
  for (const t of running) {
    const since = t.bracketAt ?? t.startsAt ?? t.createdAt;
    const profilesOfTeam = new Map(t.teams.map((team) => [team.id, team.members.map((m) => m.player.profileId)]));
    const all = [...new Set([...profilesOfTeam.values()].flat())];
    if (all.length === 0) continue;
    const ready = await db.query.tournamentMatches.findMany({ where: and(eq(tournamentMatches.tournamentId, t.id), eq(tournamentMatches.status, 'ready')) });
    if (ready.length === 0) continue;
    const need = t.teamSize * 2;
    const candidates = await db.execute<{ id: number; completed_at: Date; profiles: number[]; teams: number[]; outcomes: number[] }>(sql`
      select m.id, m.completed_at,
             array_agg(mm.profile_id order by mm.profile_id) as profiles,
             array_agg(mm.team order by mm.profile_id) as teams,
             array_agg(mm.outcome order by mm.profile_id) as outcomes
      from matches m
      join match_members mm on mm.match_id = m.id
      where m.completed_at > ${since.toISOString()}::timestamptz
        and m.id in (select match_id from match_members where profile_id in ${all})
        and (select count(*) from match_members x where x.match_id = m.id) = ${need}
      group by m.id, m.completed_at
      order by m.completed_at asc
    `);
    const used = new Set((await db.select({ matchId: tournamentGames.matchId }).from(tournamentGames)
      .innerJoin(tournamentMatches, eq(tournamentMatches.id, tournamentGames.tournamentMatchId))
      .where(eq(tournamentMatches.tournamentId, t.id))).map((r) => r.matchId));
    for (const c of candidates) {
      if (used.has(Number(c.id))) continue;
      const profiles = c.profiles.map(Number);
      for (const rm of ready) {
        if (!rm.teamAId || !rm.teamBId) continue;
        const a = profilesOfTeam.get(rm.teamAId) ?? [], b = profilesOfTeam.get(rm.teamBId) ?? [];
        const want = [...a, ...b].sort((x, y) => x - y);
        if (want.length !== profiles.length || want.some((p, i) => p !== profiles[i])) continue;
        const teamOf = (pid: number) => c.teams[profiles.indexOf(pid)];
        const outcomeOf = (pid: number) => c.outcomes[profiles.indexOf(pid)];
        const ta = new Set(a.map(teamOf)), tb = new Set(b.map(teamOf));
        if (ta.size !== 1 || tb.size !== 1 || [...ta][0] === [...tb][0]) continue;
        const aWon = a.every((p) => outcomeOf(p) === 1), bWon = b.every((p) => outcomeOf(p) === 1);
        if (aWon === bWon) continue;
        const ok = await recordGame(rm.id, aWon ? rm.teamAId : rm.teamBId, { matchId: Number(c.id), source: 'auto', playedAt: new Date(c.completed_at) });
        if (ok) { found++; used.add(Number(c.id)); const fresh = await db.query.tournamentMatches.findFirst({ where: eq(tournamentMatches.id, rm.id) }); if (fresh) Object.assign(rm, fresh); }
        break;
      }
    }
  }
  return found;
}

/** Times de um jogador em torneios não cancelados (pra página do jogador). */
export async function tournamentsOfPlayer(playerId: number) {
  return db.query.tournamentTeamMembers.findMany({
    where: eq(tournamentTeamMembers.playerId, playerId),
    with: { team: { with: { tournament: true } } },
  });
}


/** Rating RM 1v1 atual por jogador (id interno do jogador → rating). Quem não tem rating fica de fora. */
export async function rm1v1RatingsOf(playerIds: number[]): Promise<Map<number, number>> {
  if (playerIds.length === 0) return new Map();
  const rows = await db.select({ playerId: playerRatings.playerId, rating: playerRatings.rating }).from(playerRatings)
    .where(and(inArray(playerRatings.playerId, playerIds), eq(playerRatings.leaderboardId, RM_1V1)));
  return new Map(rows.map((r) => [r.playerId, r.rating]));
}

export type MyTournament = { tournamentId: number; teamId: number; teamName: string; nextOpponent: string | null };

/**
 * Torneios (não cancelados) em que o jogador está num time não desistente.
 * nextOpponent = nome do time adversário no confronto `ready` do time, se houver.
 */
export async function myTournaments(playerId: number): Promise<MyTournament[]> {
  const rows = await db.query.tournamentTeamMembers.findMany({
    where: eq(tournamentTeamMembers.playerId, playerId),
    with: { team: { with: { tournament: { columns: { id: true, status: true } } } } },
  });
  const mine = rows.filter((r) => r.team.status !== 'withdrawn' && r.team.tournament.status !== 'cancelled');
  if (mine.length === 0) return [];
  const teamIds = mine.map((r) => r.teamId);
  const ready = await db.query.tournamentMatches.findMany({
    where: and(eq(tournamentMatches.status, 'ready'), inArray(tournamentMatches.tournamentId, mine.map((r) => r.team.tournamentId))),
  });
  const nameIds = new Set<number>();
  for (const m of ready) { if (m.teamAId) nameIds.add(m.teamAId); if (m.teamBId) nameIds.add(m.teamBId); }
  const names = nameIds.size ? await db.select({ id: tournamentTeams.id, name: tournamentTeams.name }).from(tournamentTeams).where(inArray(tournamentTeams.id, [...nameIds])) : [];
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  return mine.map((r) => {
    const m = ready.find((x) => x.teamAId === r.teamId || x.teamBId === r.teamId);
    const opp = m ? (m.teamAId === r.teamId ? m.teamBId : m.teamAId) : null;
    return { tournamentId: r.team.tournamentId, teamId: r.teamId, teamName: r.team.name, nextOpponent: opp ? nameOf.get(opp) ?? null : null };
  }).filter((x, i, a) => teamIds.includes(x.teamId) && a.findIndex((y) => y.tournamentId === x.tournamentId) === i);
}
