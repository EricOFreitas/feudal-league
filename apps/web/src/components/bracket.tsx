import type { MatchFull, TeamFull } from '@aoe2/sync';

type Labels = { tbd: string; bye: string; walkover: string; roundName: (round: number, rounds: number) => string };

/** Chave de eliminação simples: uma coluna por rodada, confrontos centralizados verticalmente. */
export function Bracket({ matches, teams, labels }: { matches: MatchFull[]; teams: Map<number, TeamFull>; labels: Labels }) {
  const rounds = Math.max(0, ...matches.map((m) => m.round));
  if (rounds === 0) return null;
  const byRound = Array.from({ length: rounds }, (_, i) => matches.filter((m) => m.round === i + 1).sort((a, b) => a.position - b.position));
  const name = (id: number | null) => (id == null ? null : teams.get(id)?.name ?? '?');

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-6">
        {byRound.map((ms, ri) => (
          <div key={ri} className="flex w-56 flex-col">
            <p className="kicker mb-3 text-center">{labels.roundName(ri + 1, rounds)}</p>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {ms.map((m) => {
                const done = m.status === 'done' || m.status === 'walkover';
                const row = (teamId: number | null, score: number, slotEmptyIsBye: boolean) => {
                  const n = name(teamId);
                  const win = done && m.winnerTeamId != null && m.winnerTeamId === teamId;
                  return (
                    <div className={`flex items-center justify-between gap-2 px-3 py-1.5 ${win ? 'bg-gold-500/15 text-gold-300' : 'text-parchment-200'}`}>
                      <span className={`truncate ${n ? '' : 'italic text-parchment-500'}`}>{n ?? (slotEmptyIsBye ? labels.bye : labels.tbd)}</span>
                      <span className="stat-num shrink-0 text-sm">{m.status === 'walkover' ? (win ? labels.walkover : '') : done || m.scoreA + m.scoreB > 0 ? score : ''}</span>
                    </div>
                  );
                };
                const byeA = m.status === 'walkover' && m.teamAId == null;
                const byeB = m.status === 'walkover' && m.teamBId == null;
                return (
                  <div key={m.id} className={`panel divide-y divide-gold-700/40 overflow-hidden text-sm ${m.status === 'ready' ? 'border-gold-500/60' : ''}`}>
                    {row(m.teamAId, m.scoreA, byeA)}
                    {row(m.teamBId, m.scoreB, byeB)}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
