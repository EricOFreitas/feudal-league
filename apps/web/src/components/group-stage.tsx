import type { ReactNode } from 'react';
import type { GroupRow, MatchFull, TeamFull } from '@aoe2/sync';
import { StageMatchRow } from './stage-match-row';

type Labels = {
  group: (n: number) => string;
  round: (n: number) => string;
  bye: (names: string) => string;
  qualify: string;
  report: (name: string) => string;
  undo: string;
  col: { rank: string; team: string; p: string; w: string; l: string; gd: string; pts: string };
};

type Props = {
  standings: Map<number, GroupRow[]>;
  matches: MatchFull[];
  teams: Map<number, TeamFull>;
  advancePerGroup: number;
  isOwner: boolean;
  /** Campos escondidos dos formulários do organizador (locale, tournamentId, slug). */
  hidden: ReactNode;
  labels: Labels;
};

/**
 * Fase de grupos: tabelas lado a lado e, embaixo, os confrontos por rodada com os grupos juntos
 * (cada rodada = o que precisa ser jogado naquela semana). O organizador registra e desfaz jogos na própria linha.
 */
export function GroupStage({ standings, matches, teams, advancePerGroup, isOwner, hidden, labels }: Props) {
  const name = (id: number | null) => (id == null ? '?' : teams.get(id)?.name ?? '?');
  const groups = [...standings.entries()].sort((a, b) => a[0] - b[0]);
  const groupMatches = matches.filter((m) => m.stage === 'group');
  const rounds = [...new Set(groupMatches.map((m) => m.round))].sort((a, b) => a - b);
  const num = 'py-1.5 text-center tabular-nums';

  return (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2">
        {groups.map(([groupNo, rows]) => (
          <div key={groupNo} className="panel p-4">
            <h3 className="font-display text-lg text-gold-300">{labels.group(groupNo)}</h3>
            <table className="mt-2 w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-6" /><col /><col className="w-7" /><col className="w-7" /><col className="w-7" /><col className="w-12" /><col className="w-9" />
              </colgroup>
              <thead className="text-[0.68rem] uppercase tracking-wider text-parchment-400">
                <tr>
                  <th className="py-1 text-left font-normal">{labels.col.rank}</th>
                  <th className="py-1 text-left font-normal">{labels.col.team}</th>
                  <th className="py-1 text-center font-normal">{labels.col.p}</th>
                  <th className="py-1 text-center font-normal">{labels.col.w}</th>
                  <th className="py-1 text-center font-normal">{labels.col.l}</th>
                  <th className="py-1 text-center font-normal">{labels.col.gd}</th>
                  <th className="py-1 text-right font-normal">{labels.col.pts}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <GroupLine key={r.teamId} r={r} pos={i + 1} name={name(r.teamId)} top={i < advancePerGroup} divider={i === advancePerGroup - 1 && rows.length > advancePerGroup ? labels.qualify : null} num={num} />
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="space-y-5">
        {rounds.map((round) => {
          const ms = groupMatches.filter((m) => m.round === round).sort((a, b) => (a.groupNo ?? 0) - (b.groupNo ?? 0) || a.position - b.position);
          const byes = groups.flatMap(([groupNo, rows]) => rows
            .filter((r) => !ms.some((m) => m.teamAId === r.teamId || m.teamBId === r.teamId))
            .map((r) => (groups.length > 1 ? `${name(r.teamId)} (G${groupNo})` : name(r.teamId))));
          return (
            <section key={round}>
              <p className="kicker mb-2">{labels.round(round)}</p>
              <ul className="panel divide-y divide-gold-700/30 !p-0">
                {ms.map((m) => <StageMatchRow key={m.id} m={m} name={name} tag={`G${m.groupNo}`} isOwner={isOwner} hidden={hidden} labels={{ report: labels.report, undo: labels.undo }} />)}
                {byes.length > 0 && <li className="px-3 py-2 text-xs text-parchment-400 sm:px-4">{labels.bye(byes.join(' · '))}</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function GroupLine({ r, pos, name, top, divider, num }: { r: GroupRow; pos: number; name: string; top: boolean; divider: string | null; num: string }) {
  return (
    <>
      <tr className={`border-t border-gold-700/30 ${top ? 'text-parchment-50' : 'text-parchment-300'}`}>
        <td className="py-1.5 tabular-nums text-parchment-400">{pos}</td>
        <td className="truncate py-1.5 pr-2" title={name}>{name}</td>
        <td className={num}>{r.played}</td>
        <td className={num}>{r.wins}</td>
        <td className={num}>{r.losses}</td>
        <td className={num}>{r.gamesWon - r.gamesLost > 0 ? `+${r.gamesWon - r.gamesLost}` : r.gamesWon - r.gamesLost}</td>
        <td className="stat-num py-1.5 text-right font-semibold">{r.points}</td>
      </tr>
      {divider && (
        <tr>
          <td colSpan={7} className="pt-1 pb-0.5">
            <span className="flex items-center gap-2 text-[0.62rem] uppercase tracking-[0.18em] text-gold-500">
              <span className="h-px flex-1 bg-gold-600/60" />{divider}<span className="h-px flex-1 bg-gold-600/60" />
            </span>
          </td>
        </tr>
      )}
    </>
  );
}
