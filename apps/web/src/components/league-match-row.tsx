import type { ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { POINTS_LOSS, POINTS_WIN, type LeagueMatchItem } from '@aoe2/sync';
import { Link } from '@/i18n/navigation';
import { divisionName } from '@/lib/leagues';
import { mapLabel } from '@/lib/format';
import { DivisionMark } from './division-mark';

/**
 * Uma partida da liga: quem venceu quem, meta (mapa · tipo · data) e o expansor
 * "Por que contou?" feito com <details>/<summary> (sem JavaScript).
 * `admin` é o formulário de anular/restaurar, só pro dono (vem pronto da página).
 */
type Props = {
  lm: LeagueMatchItem; locale: string; admin?: ReactNode;
  /** Pontos da liga (vitória/derrota). */
  points?: { win: number; loss: number };
  /** profile_ids dos membros ativos: quem não está aqui é adversário de fora (regra da Liga Global). */
  memberProfileIds?: Set<number>;
};

export async function LeagueMatchRow({ lm, locale, admin, points, memberProfileIds }: Props) {
  const t = await getTranslations('leagues');
  const tw = await getTranslations('leagues.detail.why');
  const tf = await getTranslations('leagues.detail.facts');
  const td = await getTranslations('division');
  const tp = await getTranslations('player');
  const dtm = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' });

  const voided = lm.status === 'voided';
  const wm = lm.match.members.find((m) => m.profileId === lm.winner.profileId);
  const lmm = lm.match.members.find((m) => m.profileId === lm.loser.profileId);
  const lobby = lm.match.matchtypeId === 0;
  const division = divisionName(lm.division, td);
  const map = lm.match.mapName ? mapLabel(lm.match.mapName) : tp('unknownMap');

  const pw = points?.win ?? POINTS_WIN, pl = points?.loss ?? POINTS_LOSS;
  const outsider = memberProfileIds
    ? [lm.winner, lm.loser].find((p) => !memberProfileIds.has(p.profileId))
    : undefined;
  const outsiderRating = outsider ? lm.match.members.find((m) => m.profileId === outsider.profileId)?.oldRating : undefined;
  const checks: { text: string; bad?: boolean }[] = [
    { text: tw('twoPlayers') },
    outsider
      ? { text: tw('nonMember', { division, rating: outsiderRating ?? '–' }) }
      : { text: tw('sameDivision', { division }) },
    { text: tw('afterJoin') },
    { text: lobby ? tw('lobbyCounts') : tw('rankedCounts') },
    voided
      ? { text: lm.voidReason ? tw('voidedReason', { reason: lm.voidReason }) : tw('voided'), bad: true }
      : { text: tw('points', { winner: lm.winner.alias, loser: lm.loser.alias, w: pw, l: pl }) },
  ];
  const facts: { k: string; v: string; mono?: boolean }[] = [
    { k: tf('match'), v: `#${lm.matchId}`, mono: true },
    { k: tf('type'), v: lobby ? tf('typeLobby', { n: lm.match.matchtypeId }) : tf('typeRanked', { n: lm.match.matchtypeId }) },
    { k: tf('map'), v: map },
    { k: tf('ended'), v: dtm.format(lm.match.completedAt) },
    { k: tf('result'), v: tf('resultValue', { name: lm.winner.alias }) },
    { k: tf('ratingBefore'), v: tf('ratingValue', { winner: lm.winner.alias, wr: wm?.oldRating ?? '–', loser: lm.loser.alias, lr: lmm?.oldRating ?? '–' }) },
    { k: tf('detected'), v: dtm.format(lm.createdAt) },
  ];

  return (
    <li className={`panel p-4 ${voided ? 'opacity-60' : ''}`}>
      <div className="relative space-y-1 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="tag"><DivisionMark nameKey={lm.division.nameKey} className="h-3.5 w-3.5" />{division}</span>
            <Link href={`/players/${lm.winner.profileId}`} className="font-display !text-parchment-50">{lm.winner.alias}</Link>
            <span className="text-parchment-400">({wm?.oldRating ?? '–'})</span>
            <span className="text-moss-500">{t('beat')}</span>
            <Link href={`/players/${lm.loser.profileId}`} className="font-display !text-parchment-50">{lm.loser.alias}</Link>
            <span className="text-parchment-400">({lmm?.oldRating ?? '–'})</span>
            {voided && <span className="text-crimson-500">{lm.voidReason ? t('voidedReason', { reason: lm.voidReason }) : t('voided')}</span>}
          </div>
          {admin}
        </div>

        <details className="group">
          <summary className="flex w-fit cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 text-parchment-300 [&::-webkit-details-marker]:hidden">
            <span>{map} · {tp(`matchType.${lobby ? 'lobby' : 'ranked1v1'}`)} · {dtm.format(lm.playedAt)}</span>
            <span className="inline-flex items-center gap-1 text-gold-300 group-hover:text-gold-400 group-hover:underline">
              {voided ? tw('toggleVoided') : tw('toggle')}
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            </span>
          </summary>

          <div className="mt-2 flex flex-wrap gap-x-8 gap-y-4 border-t border-gold-700/50 pt-3.5">
            <div className="min-w-0 flex-[1_1_260px]">
              <p className="kicker mb-2">{voided ? tw('titleVoided') : tw('title')}</p>
              <ul className="flex flex-col gap-1.5">
                {checks.map((c, i) => (
                  <li key={i} className={`flex items-start gap-2 ${c.bad ? 'text-crimson-500' : 'text-moss-500'}`}>
                    <Check className="mt-0.5 h-4 w-4 flex-none" strokeWidth={2.2} />
                    <span className={c.bad ? 'text-crimson-500' : 'text-parchment-200'}>{c.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0 flex-[1_1_220px]">
              <p className="kicker mb-2">{tf('title')}</p>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1">
                {facts.map((f) => (
                  <div key={f.k} className="contents">
                    <dt className="text-parchment-400">{f.k}</dt>
                    <dd className={`text-parchment-50 [overflow-wrap:anywhere] ${f.mono ? 'font-mono' : ''}`}>{f.v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2.5 text-[0.8rem] leading-[1.15rem] text-parchment-400">{tf('wrong')}</p>
            </div>
          </div>
        </details>
      </div>
    </li>
  );
}
