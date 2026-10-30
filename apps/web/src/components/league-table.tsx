import type { Division } from '@aoe2/db';
import type { RankedRow } from '@aoe2/sync';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { divisionName } from '@/lib/leagues';
import { DivisionMark } from './division-mark';
import { Flag } from './flag';

type Row = RankedRow & { divisionId?: number };

/**
 * Tabela de classificação da página da liga (uma página dela).
 * `divisions` presente = modo busca: cada linha ganha a tag da divisão.
 * Linha do jogador logado com fundo sutil; com `flash` (vindo de "Minha posição"), fundo dourado e filete.
 */
export async function LeagueTable({ rows, meId, flash = false, divisions }: {
  rows: Row[];
  meId?: number | null;
  flash?: boolean;
  divisions?: Map<number, Pick<Division, 'name' | 'nameKey'>>;
}) {
  const t = await getTranslations('leagues');
  const td = await getTranslations('division');
  return (
    <table className="w-full border-collapse text-sm">
      <thead className="text-xs uppercase tracking-wider text-parchment-400">
        <tr>
          <th className="w-11 py-1 pr-2 pl-2 text-left font-normal">{t('col.pos')}</th>
          <th className="py-1 text-left font-normal">{t('col.player')}</th>
          <th className="py-1 text-right font-normal">{t('col.rating')}</th>
          <th className="py-1 pl-2 text-right font-normal">{t('col.w')}</th>
          <th className="py-1 pl-2 text-right font-normal">{t('col.l')}</th>
          <th className="py-1 pl-2 text-right font-normal">{t('col.pts')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const me = meId != null && r.playerId === meId;
          const d = divisions && r.divisionId != null ? divisions.get(r.divisionId) : undefined;
          return (
            <tr
              key={`${r.divisionId ?? ''}-${r.playerId}`}
              id={me ? 'me' : undefined}
              className={`scroll-mt-24 border-t border-gold-700/40 ${me ? (flash ? 'bg-gold-500/[0.28]' : 'bg-gold-700/25') : ''}`}
            >
              <td className={`stat-num py-1.5 pr-2 pl-2 ${me && flash ? 'shadow-[inset_3px_0_0_var(--color-gold-400)]' : ''}`}>{r.pos}</td>
              <td className="w-full max-w-0 py-1.5">
                <Link href={`/players/${r.profileId}`} className="flex min-w-0 items-center gap-2 !text-parchment-50">
                  <Flag code={r.country} />
                  <span className="truncate">{r.alias}</span>
                  {d && (
                    <span className="inline-flex flex-none items-center gap-1 rounded-[2px] border border-gold-700 bg-black/25 px-1.5 text-[0.72rem] text-parchment-200">
                      <DivisionMark nameKey={d.nameKey} className="h-3 w-3" />{divisionName(d, td)}
                    </span>
                  )}
                </Link>
              </td>
              <td className="py-1.5 text-right text-parchment-300">{r.placementRating}</td>
              <td className="py-1.5 pl-2 text-right text-moss-500">{r.wins}</td>
              <td className="py-1.5 pl-2 text-right text-crimson-500">{r.losses}</td>
              <td className="stat-num py-1.5 pl-2 text-right text-lg">{r.points}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
