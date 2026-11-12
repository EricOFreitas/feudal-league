import type { ReactNode } from 'react';
import type { MatchFull, SwissPlan, SwissRow, TeamFull } from '@aoe2/sync';
import { swissRoundAction, undoSwissRoundAction } from '@/app/[locale]/tournaments/actions';
import { StageMatchRow } from './stage-match-row';

type Labels = {
  roundOf: (n: number) => string;
  bye: (name: string) => string;
  qualify: string;
  report: (name: string) => string;
  undo: string;
  tiebreak: string;
  col: { rank: string; team: string; w: string; l: string; maps: string; mb: string; mbTitle: string; pts: string };
  plan: { title: (n: number) => string; hint: string; vs: string; bye: string; submit: (n: number) => string };
  undoRound: (n: number) => string;
  undoRoundHint: string;
};

type Props = {
  rows: SwissRow[];
  matches: MatchFull[];
  teams: Map<number, TeamFull>;
  advance: number;
  isOwner: boolean;
  /** Sugestão da próxima rodada (só pro organizador, quando a rodada atual acabou). */
  plan: (SwissPlan & { round: number }) | null;
  /** Times que entram no emparelhamento (confirmados), pra montar os seletores. */
  activeTeams: TeamFull[];
  /** Rodada que o organizador ainda pode desfazer (nenhum jogo registrado nela), ou null. */
  undoableRound: number | null;
  hidden: ReactNode;
  labels: Labels;
};

/**
 * Fase suíça: classificação única (linha de corte do mata-mata) e os confrontos de cada rodada. O organizador monta
 * a próxima rodada a partir da sugestão do site, ajustando os seletores se a tabela oficial dele for diferente.
 */
export function SwissStage({ rows, matches, teams, advance, isOwner, plan, activeTeams, undoableRound, hidden, labels }: Props) {
  const name = (id: number | null) => (id == null ? '?' : teams.get(id)?.name ?? '?');
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => b - a); // mais recente primeiro
  const num = 'py-1.5 text-center tabular-nums';
  const field = 'w-full min-w-0 rounded border border-gold-700/60 bg-stone-950/60 px-2 py-1.5 text-sm text-parchment-50';
  const options = activeTeams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>);

  return (
    <div className="space-y-8">
      {/* sem série encerrada a ordem é só a de cadastro: a tabela (e a linha de corte) só aparece depois do primeiro resultado */}
      {rows.some((r) => r.played > 0) && (
        <div className="panel p-3 sm:p-4">
          {/* sem coluna de jogos: no suíço todos jogam as mesmas rodadas, e o nome do time precisa de espaço no celular */}
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-6" /><col /><col className="w-7 sm:w-9" /><col className="w-7 sm:w-9" /><col className="w-12 sm:w-16" /><col className="w-9 sm:w-12" /><col className="w-8 sm:w-10" />
            </colgroup>
            <thead className="text-[0.68rem] uppercase tracking-wider text-parchment-400">
              <tr>
                <th className="py-1 text-left font-normal">{labels.col.rank}</th>
                <th className="py-1 text-left font-normal">{labels.col.team}</th>
                <th className="py-1 text-center font-normal">{labels.col.w}</th>
                <th className="py-1 text-center font-normal">{labels.col.l}</th>
                <th className="py-1 text-center font-normal">{labels.col.maps}</th>
                <th className="py-1 text-center font-normal" title={labels.col.mbTitle}>{labels.col.mb}</th>
                <th className="py-1 text-right font-normal">{labels.col.pts}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const diff = r.gamesWon - r.gamesLost;
                return (
                  <SwissLine key={r.teamId} divider={i === advance - 1 && rows.length > advance ? labels.qualify : null}>
                    <tr className={`border-t border-gold-700/30 ${i < advance ? 'text-parchment-50' : 'text-parchment-400'}`}>
                      <td className="py-1.5 tabular-nums text-parchment-400">{i + 1}</td>
                      <td className="truncate py-1.5 pr-2" title={name(r.teamId)}>{name(r.teamId)}</td>
                      <td className={num}>{r.wins}</td>
                      <td className={num}>{r.losses}</td>
                      <td className={num}>{diff > 0 ? `+${diff}` : diff}</td>
                      <td className={num}>{r.buchholz}</td>
                      <td className="stat-num py-1.5 text-right font-semibold">{r.points}</td>
                    </tr>
                  </SwissLine>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-parchment-400">{labels.tiebreak}</p>
        </div>
      )}

      {isOwner && plan && (
        <form action={swissRoundAction} className="panel space-y-3 border-moss-500/50 p-4">
          {hidden}
          <input type="hidden" name="pairs" value={plan.pairs.length} />
          <h3 className="font-display text-lg text-gold-300">{labels.plan.title(plan.round)}</h3>
          <p className="text-sm text-parchment-300">{labels.plan.hint}</p>
          <ol className="space-y-2">
            {plan.pairs.map(([a, b], i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <select name={`a.${i}`} defaultValue={a} className={field} aria-label={`${i + 1}A`}>{options}</select>
                <span className="font-display text-xs text-gold-500">{labels.plan.vs}</span>
                <select name={`b.${i}`} defaultValue={b} className={field} aria-label={`${i + 1}B`}>{options}</select>
              </li>
            ))}
          </ol>
          {plan.bye != null && (
            <label className="block text-sm text-parchment-300">{labels.plan.bye}
              <select name="bye" defaultValue={plan.bye} className={`${field} mt-1`}>{options}</select>
            </label>
          )}
          <button type="submit" className="btn btn-primary">{labels.plan.submit(plan.round)}</button>
        </form>
      )}

      <div className="space-y-5">
        {rounds.map((round) => {
          const ms = matches.filter((m) => m.round === round).sort((a, b) => a.position - b.position);
          const games = ms.filter((m) => m.teamBId != null);
          const byes = ms.filter((m) => m.teamBId == null && m.teamAId != null);
          return (
            <section key={round}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="kicker">{labels.roundOf(round)}</p>
                {isOwner && undoableRound === round && (
                  <form action={undoSwissRoundAction} title={labels.undoRoundHint}>
                    {hidden}
                    <button type="submit" className="cursor-pointer text-xs text-parchment-400 hover:text-crimson-500">{labels.undoRound(round)}</button>
                  </form>
                )}
              </div>
              <ul className="panel divide-y divide-gold-700/30 !p-0">
                {games.map((m) => <StageMatchRow key={m.id} m={m} name={name} isOwner={isOwner} hidden={hidden} labels={{ report: labels.report, undo: labels.undo }} />)}
                {byes.map((m) => <li key={m.id} className="px-3 py-2 text-xs text-parchment-400 sm:px-4">{labels.bye(name(m.teamAId))}</li>)}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SwissLine({ children, divider }: { children: ReactNode; divider: string | null }) {
  return (
    <>
      {children}
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
