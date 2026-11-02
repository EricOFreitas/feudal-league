import 'server-only';
import { db, players, type Division, type Season } from '@aoe2/db';
import { seasonMonth } from '@aoe2/sync';
import { eq } from 'drizzle-orm';
import { monthNames } from './format';
import { getSession } from './session';

/** Jogador reivindicado pelo usuário logado, ou null. */
export async function sessionPlayer() {
  const session = await getSession();
  if (!session) return { session: null, player: null };
  const player = await db.query.players.findFirst({ where: eq(players.claimedByUserId, session.uid), with: { ratings: true } });
  return { session, player: player ?? null };
}

/** Nome da divisão: livre (do dono) ou padrão traduzido. */
export function divisionName(d: Pick<Division, 'name' | 'nameKey'>, t: (k: string) => string) {
  if (d.name) return d.name;
  if (d.nameKey) return t(d.nameKey);
  return '?';
}

/** Título da temporada na liga mensal ("Novembro 2026"); null nas temporadas fechadas à mão. */
export function monthTitle(s: Pick<Season, 'endsAt'>, locale: string): string | null {
  const m = seasonMonth(s);
  return m ? `${monthNames(m.year, m.month, locale).longCap} ${m.year}` : null;
}

export function slugify(s: string) {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'liga';
}
