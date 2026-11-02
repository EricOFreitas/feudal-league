import { getTranslations } from 'next-intl/server';
import { seasonMonth, type MedalItem } from '@aoe2/sync';
import { divisionName } from '@/lib/leagues';
import { monthNames } from '@/lib/format';

/** Cor pela posição: ouro, prata, bronze. */
export const MEDAL_COLORS = [
  { light: '#f0dca2', dark: '#b8893a' },
  { light: '#e4e1da', dark: '#8f8a80' },
  { light: '#e0a874', dark: '#8a5428' },
] as const;

const SHAPE = 'polygon(50% 0,100% 14%,100% 62%,50% 100%,0 62%,0 14%)';

/** Escudo da medalha. Sem `children`, é o ícone ao lado do nome. */
export function Medal({ position, title, className, children }: { position: number; title?: string; className: string; children?: React.ReactNode }) {
  const c = MEDAL_COLORS[position - 1] ?? MEDAL_COLORS[2];
  return (
    <span title={title} className={`inline-grid flex-none place-items-center font-display font-bold text-[#14100c] ${className}`} style={{ clipPath: SHAPE, background: `linear-gradient(180deg,${c.light},${c.dark})` }}>
      {children}
    </span>
  );
}

function when(m: MedalItem, locale: string) {
  const { year, month } = seasonMonth(m.season)!;
  return { ...monthNames(year, month, locale), year };
}

/** Ícone da melhor medalha, ao lado do nome do jogador. */
export async function BestMedalIcon({ medal, locale }: { medal: MedalItem; locale: string }) {
  const t = await getTranslations('podium.medal');
  const td = await getTranslations('division');
  const w = when(medal, locale);
  return <Medal position={medal.position} title={t('best', { n: medal.position, division: divisionName(medal.division, td), mon: w.short, yy: w.yy })} className="h-5 w-[1.1rem]" />;
}

/** Prateleira de medalhas do perfil. */
export async function MedalShelf({ medals, locale }: { medals: MedalItem[]; locale: string }) {
  const t = await getTranslations('podium');
  const td = await getTranslations('division');
  if (medals.length === 0) return <p className="text-sm italic text-parchment-400">{t('profile.empty')}</p>;
  const count = (p: number) => medals.filter((m) => m.position === p).length;
  return (
    <>
      <p className="flex items-baseline justify-between gap-2">
        <span className="font-display text-xs tracking-[0.2em] text-gold-500 uppercase">{t('profile.title', { count: medals.length })}</span>
        <span className="text-[0.85rem] text-parchment-400">{t('profile.summary', { gold: count(1), silver: count(2), bronze: count(3) })}</span>
      </p>
      <ul className="flex flex-wrap gap-3">
        {medals.map((m) => {
          const w = when(m, locale);
          const division = divisionName(m.division, td);
          return (
            <li key={m.id} title={t('medal.tooltip', { n: m.position, division, month: w.longCap, year: w.year, wins: m.wins, losses: m.losses })} className="flex items-center gap-2 rounded-[3px] border border-[#3a2c1c] bg-[#1a140f] py-[0.4rem] pr-[0.7rem] pl-[0.45rem]">
              <Medal position={m.position} className="h-[1.8rem] w-[1.6rem] text-[0.8rem]">{m.position}</Medal>
              <span className="flex flex-col leading-[1.15]">
                <span className="font-display text-[0.85rem] text-parchment-50">{t('medal.short', { mon: w.short, yy: w.yy })}</span>
                <span className="text-[0.78rem] text-parchment-400">{division}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
