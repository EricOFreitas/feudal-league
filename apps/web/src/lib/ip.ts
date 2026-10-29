import 'server-only';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';

/** Hash do IP do visitante. Só pra limitar adições por rede, nunca pra identificar pessoa. */
export async function ipHash(): Promise<string> {
  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || h.get('x-real-ip') || 'local';
  const salt = process.env.SESSION_SECRET ?? '';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}
