import { LEADERBOARDS, leaderboardOfMatchType, type LeaderboardId } from '@aoe2/aoe-api';

export function lbKey(id: number): string {
  return (LEADERBOARDS as Record<number, { key: string }>)[id]?.key ?? `lb_${id}`;
}
export function isKnownLb(id: number): id is LeaderboardId {
  return id in LEADERBOARDS;
}

/** matchtype_id -> chave de tradução. Baseado no leaderboardmap de getAvailableLeaderboards. */
export function matchTypeKey(id: number): 'ranked1v1' | 'rankedTeam' | 'dm' | 'ew' | 'br' | 'console' | 'event' | 'lobby' | 'other' {
  const lb = leaderboardOfMatchType(id);
  if (lb === 3) return 'ranked1v1';
  if (lb === 4) return 'rankedTeam';
  if (lb === 1 || lb === 2) return 'dm';
  if (lb === 13 || lb === 14) return 'ew';
  if (lb === 5) return 'br';
  if (lb === 15 || lb === 16 || lb === 17 || lb === 18) return 'console';
  if (lb === 25 || lb === 26 || lb === 27 || lb === 28 || lb === 29 || lb === 30) return 'event';
  if (id === 0) return 'lobby';
  return 'other';
}

/** Nomes de um mês no idioma da página: "novembro", "Novembro", "Nov" e "26". */
export function monthNames(year: number, month: number, locale: string) {
  const d = new Date(Date.UTC(year, month - 1, 15));
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const long = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(d);
  const short = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(d).replace('.', '');
  return { long, longCap: cap(long), short: cap(short), yy: String(year).slice(-2) };
}

export function mapLabel(raw: string): string {
  return raw.replace(/\.rms$/i, '').replace(/[_-]+/g, ' ').trim();
}

export function winrate(w: number, l: number): string {
  const n = w + l;
  return n === 0 ? '–' : `${Math.round((w / n) * 100)}%`;
}

export function agoParts(d: Date | null): { key: 'now' | 'minutes' | 'hours' | 'days'; n: number } | null {
  if (!d) return null;
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return { key: 'now', n: 0 };
  if (s < 3600) return { key: 'minutes', n: Math.floor(s / 60) };
  if (s < 86400) return { key: 'hours', n: Math.floor(s / 3600) };
  return { key: 'days', n: Math.floor(s / 86400) };
}
