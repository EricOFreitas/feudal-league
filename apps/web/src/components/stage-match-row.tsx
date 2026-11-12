import type { ReactNode } from 'react';
import type { MatchFull } from '@aoe2/sync';
import { reportGameAction, undoGameAction } from '@/app/[locale]/tournaments/actions';

type Props = {
  m: MatchFull;
  name: (id: number | null) => string;
  /** Etiqueta à esquerda (ex.: "G1" na fase de grupos); sem ela a coluna some. */
  tag?: string;
  isOwner: boolean;
  /** Campos escondidos dos formulários do organizador (locale, tournamentId, slug). */
  hidden: ReactNode;
  labels: { report: (name: string) => string; undo: string };
};

/** Linha de confronto da fase 1 (grupos ou suíço): placar no meio; o organizador registra (+1) e desfaz (↶) na própria linha. */
export function StageMatchRow({ m, name, tag, isOwner, hidden, labels }: Props) {
  const done = m.status === 'done' || m.status === 'walkover';
  const open = m.status === 'ready';
  const tone = (id: number | null) => (done ? (m.winnerTeamId === id ? 'font-semibold text-gold-300' : 'text-parchment-400') : 'text-parchment-50');
  const cols = [tag != null ? 'auto' : null, 'minmax(0,1fr)', 'auto', 'minmax(0,1fr)', isOwner ? 'auto' : null].filter(Boolean).join(' ');

  return (
    <li className="grid items-center gap-x-3 px-3 py-2 text-sm sm:px-4" style={{ gridTemplateColumns: cols }}>
      {tag != null && <span className="rounded-[2px] border border-gold-700/60 px-1.5 text-[0.68rem] text-parchment-300">{tag}</span>}
      <span className="flex min-w-0 items-center justify-end gap-2">
        <span className={`truncate ${tone(m.teamAId)}`}>{name(m.teamAId)}</span>
        {isOwner && open && m.teamAId && <ReportButton matchId={m.id} teamId={m.teamAId} title={labels.report(name(m.teamAId))} hidden={hidden} />}
      </span>
      <span className={`stat-num w-14 text-center ${m.games.length > 0 ? 'text-parchment-50' : 'text-parchment-400'}`}>{m.scoreA} – {m.scoreB}</span>
      <span className="flex min-w-0 items-center gap-2">
        {isOwner && open && m.teamBId && <ReportButton matchId={m.id} teamId={m.teamBId} title={labels.report(name(m.teamBId))} hidden={hidden} />}
        <span className={`truncate ${tone(m.teamBId)}`}>{name(m.teamBId)}</span>
      </span>
      {isOwner && (
        m.games.length > 0 ? (
          <form action={undoGameAction}>
            {hidden}<input type="hidden" name="matchId" value={m.id} />
            <button type="submit" title={labels.undo} aria-label={labels.undo} className="cursor-pointer px-1 text-parchment-400 hover:text-crimson-500">↶</button>
          </form>
        ) : <span className="w-5" />
      )}
    </li>
  );
}

/** +1 pra um time: registra um jogo vencido por ele (manual). */
function ReportButton({ matchId, teamId, title, hidden }: { matchId: number; teamId: number; title: string; hidden: ReactNode }) {
  return (
    <form action={reportGameAction} className="flex-none">
      {hidden}<input type="hidden" name="matchId" value={matchId} /><input type="hidden" name="winnerTeamId" value={teamId} />
      <button type="submit" title={title} aria-label={title}
        className="cursor-pointer rounded-[2px] border border-gold-700/70 px-1.5 text-[0.7rem] leading-5 text-gold-300 hover:bg-gold-700/25">+1</button>
    </form>
  );
}
