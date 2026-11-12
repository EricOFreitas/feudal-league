/**
 * Sistema suíço (formato swiss_elim; pedido do Paganini pra PG Cup, 12/11/2026). Todos jogam todas as rodadas e quem
 * vence enfrenta quem venceu. Ponto = série vencida; folga vale vitória sem mapas.
 * Desempate, nesta ordem (a mesma que a tabela dele, no Challonge, usa): confronto direto (vitórias contra times com os
 * mesmos pontos), Median-Buchholz (pontos dos adversários sem o maior e o menor), saldo de mapas, mapas ganhos, seed.
 * Só funções puras: as que gravam no banco ficam em tournaments.ts.
 */

type SwissTeam = { id: number; status: string; seed: number | null };
type SwissMatch = { stage: string; round: number; teamAId: number | null; teamBId: number | null; winnerTeamId: number | null; status: string; scoreA: number; scoreB: number };

export type SwissRow = {
  teamId: number; played: number; wins: number; losses: number; byes: number; points: number;
  gamesWon: number; gamesLost: number;
  /** Vitórias contra times com os mesmos pontos (confronto direto). */
  h2h: number;
  /** Median-Buchholz: soma dos pontos dos adversários sem o maior e o menor (com menos de 3 adversários, a soma inteira). */
  buchholz: number;
  opponents: number[];
};

const closed = (m: SwissMatch) => m.status === 'done' || m.status === 'walkover';
export const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** Classificação do suíço. Times desistentes contam pro Buchholz de quem jogou com eles, mas saem da lista. */
export function swissStandings(teams: SwissTeam[], matches: SwissMatch[]): SwissRow[] {
  const swiss = matches.filter((m) => m.stage === 'swiss');
  const rows = new Map<number, SwissRow>();
  const row = (id: number) => {
    let r = rows.get(id);
    if (!r) { r = { teamId: id, played: 0, wins: 0, losses: 0, byes: 0, points: 0, gamesWon: 0, gamesLost: 0, h2h: 0, buchholz: 0, opponents: [] }; rows.set(id, r); }
    return r;
  };
  for (const t of teams) if (t.status === 'confirmed') row(t.id);
  for (const m of swiss) {
    if (!m.teamAId) continue;
    const a = row(m.teamAId);
    if (!m.teamBId) { // folga
      if (closed(m)) { a.played++; a.wins++; a.byes++; a.points++; }
      continue;
    }
    const b = row(m.teamBId);
    a.gamesWon += m.scoreA; a.gamesLost += m.scoreB; b.gamesWon += m.scoreB; b.gamesLost += m.scoreA;
    if (!closed(m)) continue;
    a.played++; b.played++;
    a.opponents.push(b.teamId); b.opponents.push(a.teamId);
    if (m.winnerTeamId === a.teamId) { a.wins++; a.points++; b.losses++; } else if (m.winnerTeamId === b.teamId) { b.wins++; b.points++; a.losses++; }
  }
  const pts = (id: number) => rows.get(id)?.points ?? 0;
  for (const r of rows.values()) {
    const opp = r.opponents.map(pts);
    const sum = opp.reduce((s, x) => s + x, 0);
    r.buchholz = opp.length >= 3 ? sum - Math.max(...opp) - Math.min(...opp) : sum;
  }
  for (const m of swiss) {
    if (!closed(m) || !m.teamAId || !m.teamBId || !m.winnerTeamId) continue;
    const loser = m.winnerTeamId === m.teamAId ? m.teamBId : m.teamAId;
    if (pts(m.winnerTeamId) === pts(loser)) row(m.winnerTeamId).h2h++;
  }
  const seedOf = new Map(teams.map((t) => [t.id, t.seed ?? Number.MAX_SAFE_INTEGER]));
  const active = new Set(teams.filter((t) => t.status === 'confirmed').map((t) => t.id));
  return [...rows.values()].filter((r) => active.has(r.teamId)).sort((x, y) =>
    y.points - x.points || y.h2h - x.h2h || y.buchholz - x.buchholz
    || (y.gamesWon - y.gamesLost) - (x.gamesWon - x.gamesLost) || y.gamesWon - x.gamesWon
    || (seedOf.get(x.teamId) ?? 0) - (seedOf.get(y.teamId) ?? 0) || x.teamId - y.teamId);
}

export type SwissPlan = { pairs: [number, number][]; bye: number | null };

/**
 * Sugere os confrontos de uma rodada. `order` = times na ordem da classificação (ou dos seeds, na 1ª rodada).
 * O primeiro sem par enfrenta quem está meio grupo abaixo dele entre os de mesma pontuação (com 10 empatados:
 * 1×6, 2×7, 3×8…, como no sistema holandês), sem repetir adversário; se não houver, desce pra pontuação seguinte.
 * Número ímpar: folga pro pior colocado que ainda não folgou. Se não der pra evitar revanche, aceita revanche.
 */
export function swissPairings(order: number[], points: Map<number, number>, met: Set<string>, hadBye: Set<number>): SwissPlan {
  let list = [...order];
  let bye: number | null = null;
  if (list.length % 2 === 1) {
    bye = [...list].reverse().find((id) => !hadBye.has(id)) ?? list[list.length - 1]!;
    list = list.filter((id) => id !== bye);
  }
  const pt = (id: number) => points.get(id) ?? 0;
  let budget = 200_000;
  const solve = (rest: number[], allowRematch: boolean): [number, number][] | null => {
    if (rest.length === 0) return [];
    if (--budget < 0) return null;
    const [t, ...others] = rest as [number, ...number[]];
    const same = others.filter((x) => pt(x) === pt(t));
    // grupo de pontos = [t, ...same]; alvo = posição g/2 do grupo, ou seja, same[g/2 - 1]
    const target = Math.floor((same.length + 1) / 2) - 1;
    const ranked = same.map((x, i) => ({ x, k: Math.abs(i - target) * 2 + (i < target ? 1 : 0) })).sort((a, b) => a.k - b.k).map((c) => c.x);
    const candidates = [...ranked, ...others.filter((x) => pt(x) !== pt(t))];
    for (const c of candidates) {
      if (!allowRematch && met.has(pairKey(t, c))) continue;
      const sub = solve(others.filter((x) => x !== c), allowRematch);
      if (sub) return [[t, c], ...sub];
    }
    return null;
  };
  const pairs = solve(list, false) ?? ((budget = 200_000), solve(list, true)) ?? [];
  return { pairs, bye };
}
