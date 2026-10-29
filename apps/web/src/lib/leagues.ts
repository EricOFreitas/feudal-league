import 'server-only';
import { db, players, type Division } from '@aoe2/db';
import { eq } from 'drizzle-orm';
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

export function slugify(s: string) {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'liga';
}
