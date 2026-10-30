import type { Match, MatchMember } from '@aoe2/db';
import { civName } from '@aoe2/aoe-api';
import { Link } from '@/i18n/navigation';
import { mapLabel, matchTypeKey } from '@/lib/format';

type Labels = {
  win: string; loss: string; vs: string; team: string; unknownMap: string; type: (k: ReturnType<typeof matchTypeKey>) => string;
  analyze?: string; viewAnalysis?: string; analysisPending?: string;
};

type Props = {
  match: Match & { members: MatchMember[] }; me: number; locale: string; labels: Labels;
  /** Status da análise desta partida pro jogador (null = nenhuma). */
  analysis?: string | null;
  /** Visitante é o dono do perfil e pode pedir análise. */
  canAnalyze?: boolean;
};

export function MatchRow({ match, me, locale, labels, analysis = null, canAnalyze = false }: Props) {
  const mine = match.members.find((m) => m.profileId === me);
  const won = mine?.outcome === 1;
  const delta = mine ? mine.newRating - mine.oldRating : 0;
  const allies = match.members.filter((m) => m.profileId !== me && mine && m.team === mine.team);
  const foes = match.members.filter((m) => !mine || m.team !== mine.team);
  const dt = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' });
  const mins = Math.round((match.completedAt.getTime() - match.startedAt.getTime()) / 60000);

  const Who = ({ m }: { m: MatchMember }) => (
    <span className="inline-flex items-center gap-1">
      <Link href={`/players/${m.profileId}`} className="text-parchment-50">{m.alias ?? `#${m.profileId}`}</Link>
      <span className="text-parchment-400">({m.oldRating}, {civName(m.civId)})</span>
    </span>
  );

  return (
    <li className={`panel flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between ${mine ? (won ? 'row-win' : 'row-loss') : ''}`}>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`font-display font-semibold ${won ? 'text-moss-500' : 'text-crimson-500'}`}>{mine ? (won ? labels.win : labels.loss) : '–'}</span>
          {mine && delta !== 0 && <span className={`stat-num ${delta > 0 ? 'text-moss-500' : 'text-crimson-500'}`}>{delta > 0 ? `+${delta}` : delta}</span>}
          <span className="tag">{labels.type(matchTypeKey(match.matchtypeId))}</span>
          <span className="text-parchment-200">{match.mapName ? mapLabel(match.mapName) : labels.unknownMap}</span>
          {mine && <span className="text-parchment-400">· {civName(mine.civId)}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-parchment-300">
          {allies.length > 0 && <span>{labels.team}: {allies.map((m, i) => <span key={m.profileId}>{i > 0 && ', '}<Who m={m} /></span>)}</span>}
          <span>{labels.vs} {foes.map((m, i) => <span key={m.profileId}>{i > 0 && ', '}<Who m={m} /></span>)}</span>
        </div>
      </div>
      <div className="shrink-0 text-right text-xs text-parchment-400">
        {dt.format(match.completedAt)}<br />{mins} min
        {mine && (analysis === 'done' ? (
          <><br /><Link href={`/analyses/${match.id}/${me}`} className="text-gold-400">{labels.viewAnalysis}</Link></>
        ) : analysis ? (
          <><br /><Link href={`/analyses/${match.id}/${me}`} className="text-parchment-300">{labels.analysisPending}</Link></>
        ) : canAnalyze ? (
          <><br /><Link href={`/analyses/${match.id}/${me}`} className="text-gold-400">{labels.analyze}</Link></>
        ) : null)}
      </div>
    </li>
  );
}
