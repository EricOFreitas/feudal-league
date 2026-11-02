/**
 * Dados da home: a Liga Global do mês.
 * Variação de rating e V/D do período vêm das ranqueadas gravadas (match_members), não de retratos: valem desde
 * a primeira sincronização do jogador. A posição anterior no ranking é o rating de hoje menos a variação.
 * Troca de divisão só existe na virada do mês, porque a divisão fica congelada dentro dele.
 */
import { RM_1V1 } from '@aoe2/aoe-api';
import { db, divisions, leagueMembers, leagues, playerRatings, players, seasons, standingSnapshots, tournaments, type Division } from '@aoe2/db';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { GLOBAL_SLUG, RM_1V1_MATCHTYPE, activeSeason, monthBoundaryAfter, seasonMonth, standings } from './leagues';

export type HomePeriod = 'week' | 'month';

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<HomePeriod, number> = { week: 7, month: 30 };

export async function globalHome(period: HomePeriod, playerId: number | null) {
  const league = await db.query.leagues.findFirst({ where: eq(leagues.slug, GLOBAL_SLUG) });
  const season = league && await activeSeason(league.id);
  if (!league || !season) return null;
  const divs = await db.query.divisions.findMany({ where: eq(divisions.leagueId, league.id), orderBy: [asc(divisions.sort)] });
  const divById = new Map<number, Division>(divs.map((d) => [d.id, d]));
  const month = seasonMonth({ endsAt: season.endsAt ?? monthBoundaryAfter(season.startedAt) })!;

  const rows = await db
    .select({
      playerId: leagueMembers.playerId, divisionId: leagueMembers.divisionId, placementRating: leagueMembers.placementRating,
      profileId: players.profileId, alias: players.alias, country: players.country,
      rating: playerRatings.rating, streak: playerRatings.streak, lastMatchAt: playerRatings.lastMatchAt,
    })
    .from(leagueMembers)
    .innerJoin(players, eq(players.id, leagueMembers.playerId))
    .leftJoin(playerRatings, and(eq(playerRatings.playerId, leagueMembers.playerId), eq(playerRatings.leaderboardId, RM_1V1)))
    .where(and(eq(leagueMembers.seasonId, season.id), isNull(leagueMembers.leftAt)));
  const members = rows.map((r) => ({ ...r, rating: r.rating ?? r.placementRating }));
  const byProfile = new Map(members.map((m) => [m.profileId, m]));

  /* ── ranqueadas do período ── */
  const since = new Date(Date.now() - PERIOD_DAYS[period] * DAY_MS);
  const stats = await db.execute<{ profile_id: number; delta: number; wins: number; losses: number }>(sql`
    select mm.profile_id, sum(mm.new_rating - mm.old_rating)::int as delta,
           count(*) filter (where mm.outcome = 1)::int as wins, count(*) filter (where mm.outcome = 0)::int as losses
    from match_members mm
    join matches m on m.id = mm.match_id
    join players p on p.profile_id = mm.profile_id
    join league_members lm on lm.player_id = p.id and lm.season_id = ${season.id} and lm.left_at is null
    where m.matchtype_id = ${RM_1V1_MATCHTYPE} and m.completed_at > ${since.toISOString()}::timestamptz
    group by mm.profile_id
  `);
  const statOf = new Map([...stats].map((s) => [Number(s.profile_id), { delta: Number(s.delta), wins: Number(s.wins), losses: Number(s.losses) }]));

  /* ── ranking por rating, com a posição de antes ── */
  const byRating = [...members].sort((a, b) => b.rating - a.rating || a.profileId - b.profileId);
  const rankOf = new Map(byRating.map((m, i) => [m.profileId, i + 1]));
  const before = [...members]
    .map((m) => ({ profileId: m.profileId, rating: m.rating - (statOf.get(m.profileId)?.delta ?? 0) }))
    .sort((a, b) => b.rating - a.rating || a.profileId - b.profileId);
  const rankBefore = new Map(before.map((m, i) => [m.profileId, i + 1]));
  const ranking = byRating.slice(0, 10).map((m, i) => ({ ...m, pos: i + 1, delta: rankBefore.get(m.profileId)! - (i + 1) }));

  const movers = [...members]
    .flatMap((m) => {
      const s = statOf.get(m.profileId);
      return s && s.delta !== 0 ? [{ ...m, ...s }] : [];
    });
  const risers = movers.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5);
  const fallers = movers.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5);

  /* ── quem trocou de divisão na última virada ── */
  const prev = season.number > 1 ? await db.query.seasons.findFirst({ where: and(eq(seasons.leagueId, league.id), eq(seasons.number, season.number - 1)) }) : undefined;
  const prevRows = prev ? await db.select({ playerId: leagueMembers.playerId, divisionId: leagueMembers.divisionId }).from(leagueMembers).where(and(eq(leagueMembers.seasonId, prev.id), isNull(leagueMembers.leftAt))) : [];
  const wasIn = new Map(prevRows.map((r) => [r.playerId, r.divisionId]));
  const left = new Map(divs.map((d) => [d.id, { up: 0, down: 0 }]));
  const moved = members.flatMap((m) => {
    const from = divById.get(wasIn.get(m.playerId) ?? -1);
    const to = divById.get(m.divisionId);
    if (!from || !to || from.id === to.id) return [];
    const up = to.sort > from.sort;
    const flow = left.get(from.id)!;
    if (up) flow.up++; else flow.down++;
    return [{ ...m, from, to, up }];
  });

  /* ── destaques da semana ── */
  const weekAgo = new Date(Date.now() - PERIOD_DAYS.week * DAY_MS);
  const streak = members
    .filter((m) => (m.streak ?? 0) > 0 && m.lastMatchAt != null && m.lastMatchAt > weekAgo)
    .sort((a, b) => b.streak! - a.streak!)[0] ?? null;
  const [upset] = await db.execute<{ profile_id: number; opponent: string | null; gap: number }>(sql`
    select w.profile_id, l.alias as opponent, (l.old_rating - w.old_rating)::int as gap
    from match_members w
    join match_members l on l.match_id = w.match_id and l.profile_id <> w.profile_id
    join matches m on m.id = w.match_id
    join players p on p.profile_id = w.profile_id
    join league_members lm on lm.player_id = p.id and lm.season_id = ${season.id} and lm.left_at is null
    where m.matchtype_id = ${RM_1V1_MATCHTYPE} and m.completed_at > ${weekAgo.toISOString()}::timestamptz and w.outcome = 1 and l.outcome = 0
    order by gap desc limit 1
  `);
  const [busiest] = await db.execute<{ player_id: number; n: number }>(sql`
    select x.player_id, count(*)::int as n
    from (select winner_player_id as player_id from league_matches where season_id = ${season.id} and status = 'counted' and played_at > ${weekAgo.toISOString()}::timestamptz
          union all
          select loser_player_id from league_matches where season_id = ${season.id} and status = 'counted' and played_at > ${weekAgo.toISOString()}::timestamptz) x
    join league_members lm on lm.player_id = x.player_id and lm.season_id = ${season.id} and lm.left_at is null
    group by x.player_id order by n desc limit 1
  `);

  const running = await db.query.tournaments.findMany({
    where: inArray(tournaments.status, ['open', 'groups', 'running']),
    orderBy: [desc(tournaments.createdAt)],
    limit: 3,
  });

  /* ── o jogador logado ── */
  const mine = playerId != null ? members.find((m) => m.playerId === playerId) : undefined;
  let me = null;
  if (mine) {
    const table = await standings(season.id, mine.divisionId);
    const divisionPos = table.findIndex((r) => r.playerId === mine.playerId) + 1;
    const snap = await db.query.standingSnapshots.findFirst({
      where: and(eq(standingSnapshots.seasonId, season.id), eq(standingSnapshots.playerId, mine.playerId)),
      orderBy: [period === 'week' ? desc(standingSnapshots.capturedAt) : asc(standingSnapshots.capturedAt)],
    });
    const division = divById.get(mine.divisionId)!;
    me = {
      ...mine, division, divisionPos, divisionDelta: snap ? snap.position - divisionPos : null,
      globalPos: rankOf.get(mine.profileId)!, next: divs.find((d) => d.sort === division.sort + 1) ?? null,
    };
  }

  return {
    league, season, month, total: members.length,
    divisions: divs.map((division) => ({ division, members: members.filter((m) => m.divisionId === division.id).length, ...left.get(division.id)! })),
    divById, ranking, risers, fallers,
    moved: moved.sort((a, b) => b.rating - a.rating),
    movedUp: moved.filter((m) => m.up).length, movedDown: moved.filter((m) => !m.up).length,
    highlights: {
      streak,
      upset: upset ? { player: byProfile.get(Number(upset.profile_id))!, opponent: upset.opponent, gap: Number(upset.gap) } : null,
      busiest: busiest ? { player: members.find((m) => m.playerId === Number(busiest.player_id))!, n: Number(busiest.n) } : null,
    },
    tournaments: running, me,
  };
}
