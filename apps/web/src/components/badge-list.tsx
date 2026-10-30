import { getTranslations } from 'next-intl/server';
import { BADGES, type BadgeKey } from '@aoe2/sync';

/** Ícone de um badge (path Lucide), traço na cor do badge. */
export function BadgeIcon({ badge, className = 'h-3.5 w-3.5', strokeWidth = 2 }: { badge: BadgeKey; className?: string; strokeWidth?: number }) {
  const b = BADGES[badge];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={b.color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={b.icon} />
    </svg>
  );
}

/** Tag de um badge: ícone colorido + rótulo; o title (tooltip) diz por que o jogador tem. */
export function BadgeTag({ badge, label, title }: { badge: BadgeKey; label: string; title: string }) {
  return (
    <span title={title} className="tag whitespace-nowrap !text-parchment-100" style={{ borderColor: BADGES[badge].color }}>
      <BadgeIcon badge={badge} />
      {label}
    </span>
  );
}

/** Linha de tags dos badges de um jogador. Nada se a lista estiver vazia. */
export async function BadgeList({ badges, className = '' }: { badges: BadgeKey[]; className?: string }) {
  if (badges.length === 0) return null;
  const t = await getTranslations('badges');
  return (
    <span className={`flex flex-wrap gap-1.5 ${className}`} aria-label={t('aria')}>
      {badges.map((b) => <BadgeTag key={b} badge={b} label={t(`${b}.label`)} title={t(`${b}.title`)} />)}
    </span>
  );
}
