import type { MatchFull, TeamFull } from '@aoe2/sync';
import { Flag } from '@/components/flag';
import { Link } from '@/i18n/navigation';

type Labels = {
  tbd: string; bye: string; walkover: string;
  /** Texto do rodapé do cartão. */
  statusAuto: string; statusManual: string; statusSearching: string; statusWaiting: string;
  roundName: (round: number, rounds: number) => string;
  gamesCount: (n: number) => string;
  formatDate: (d: Date) => string;
};

/**
 * Chave de eliminação simples: uma coluna por rodada, cada confronto é um cartão com os dois lados
 * (seed, bandeira do primeiro jogador, nome, rating médio RM 1v1, placar) e um rodapé de status.
 */
export function Bracket({ matches, teams, ratings, running, labels }: {
  matches: MatchFull[];
  teams: Map<number, TeamFull>;
  /** Rating médio RM 1v1 por time (omitido quando ninguém do time tem rating). */
  ratings: Map<number, number>;
  /** Torneio com a chave em andamento: confronto `ready` mostra "Procurando no histórico". */
  running: boolean;
  labels: Labels;
}) {
  const rounds = Math.max(0, ...matches.map((m) => m.round));
  if (rounds === 0) return null;
  const byRound = Array.from({ length: rounds }, (_, i) => matches.filter((m) => m.round === i + 1).sort((a, b) => a.position - b.position));

  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${rounds}, minmax(240px, 1fr))`, minWidth: `${rounds * 264}px` }}>
        {byRound.map((ms, ri) => (
          <div key={ri} className="flex flex-col">
            <p className="kicker mb-3 !text-parchment-400">{labels.roundName(ri + 1, rounds)}</p>
            <div className="flex flex-1 flex-col justify-around gap-4">
              {ms.map((m) => {
                const finished = m.status === 'done' || m.status === 'walkover';
                const side = (teamId: number | null, score: number, isBye: boolean, first: boolean) => {
                  const team = teamId == null ? null : teams.get(teamId) ?? null;
                  const won = finished && m.winnerTeamId != null && m.winnerTeamId === teamId;
                  const lost = finished && m.winnerTeamId != null && m.winnerTeamId !== teamId;
                  const lead = team ? [...team.members].sort((a, b) => Number(b.isCaptain) - Number(a.isCaptain))[0] : null;
                  const rating = teamId != null ? ratings.get(teamId) : undefined;
                  const nameEl = team ? (
                    <>
                      <Flag code={lead?.player.country} className="leading-none" />
                      <span className="truncate font-display">{team.name}</span>
                    </>
                  ) : <span className="truncate italic text-parchment-400">{isBye ? labels.bye : labels.tbd}</span>;
                  const color = won ? 'text-gold-300' : 'text-parchment-100';
                  return (
                    <div className={`relative z-[1] grid grid-cols-[1.5rem_minmax(0,1fr)_auto_auto] items-center gap-2 px-3.5 py-2 ${first ? '' : 'border-t border-gold-700/50'} ${lost ? 'opacity-55' : ''}`}>
                      <span className="stat-num !text-[0.8rem] !text-parchment-400">{team?.seed ?? ''}</span>
                      {team && team.members.length === 1 && lead ? (
                        <Link href={`/players/${lead.player.profileId}`} className={`flex min-w-0 items-center gap-1.5 no-underline hover:no-underline ${color}`}>{nameEl}</Link>
                      ) : <span className={`flex min-w-0 items-center gap-1.5 ${color}`}>{nameEl}</span>}
                      <span className="text-[0.8rem] text-parchment-400">{rating != null ? rating : ''}</span>
                      <span className={`stat-num min-w-4 text-right ${won ? '' : '!text-parchment-200'}`}>
                        {m.status === 'walkover' ? (won ? labels.walkover : '') : finished || m.scoreA + m.scoreB > 0 ? score : ''}
                      </span>
                    </div>
                  );
                };

                const lastGame = m.games.at(-1);
                const manual = m.games.some((g) => g.source === 'manual');
                let statusText: string;
                let statusColor = 'text-parchment-400';
                if (m.status === 'walkover') { statusText = labels.walkover; statusColor = 'text-parchment-300'; }
                else if (m.status === 'done') { statusText = manual || !lastGame ? labels.statusManual : labels.statusAuto; statusColor = manual || !lastGame ? 'text-parchment-300' : 'text-moss-500'; }
                else if (m.status === 'ready') { statusText = running ? labels.statusSearching : labels.statusWaiting; statusColor = 'text-gold-300'; }
                else statusText = labels.statusWaiting;
                const meta = m.status === 'walkover' ? '' : m.games.length > 0 ? labels.gamesCount(m.games.length) : m.scheduledAt ? labels.formatDate(m.scheduledAt) : '';

                const byeA = m.status === 'walkover' && m.teamAId == null;
                const byeB = m.status === 'walkover' && m.teamBId == null;
                return (
                  <div key={m.id} className={`panel text-sm ${m.status === 'ready' ? '!border-gold-400' : ''}`}>
                    {side(m.teamAId, m.scoreA, byeA, true)}
                    {side(m.teamBId, m.scoreB, byeB, false)}
                    <div className="relative z-[1] flex items-center justify-between gap-2 border-t border-gold-700/50 px-3.5 py-1.5 text-xs text-parchment-400">
                      <span className={statusColor}>{statusText}</span>
                      <span>{meta}</span>
                    </div>
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
