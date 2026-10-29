import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

const COOKIE = 'aoe2_session';
const MAX_AGE = 30 * 24 * 60 * 60;

export type Session = { uid: number; sid: string };

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET ausente ou curta (mín. 32 chars)');
  return new TextEncoder().encode(s);
}

export async function createSessionCookie(session: Session) {
  const token = await new SignJWT(session).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(secret());
  return { name: COOKIE, value: token, httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: MAX_AGE };
}

export function clearSessionCookie() {
  return { name: COOKIE, value: '', httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 };
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.uid !== 'number' || typeof payload.sid !== 'string') return null;
    return { uid: payload.uid, sid: payload.sid };
  } catch {
    return null;
  }
}
