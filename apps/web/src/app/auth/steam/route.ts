import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { steamLoginUrl } from '@/lib/steam-openid';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = url.searchParams.get('next') ?? '';
  const state = randomBytes(16).toString('hex');
  const res = NextResponse.redirect(steamLoginUrl(state));
  res.cookies.set('aoe2_oid_state', JSON.stringify({ state, next }), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });
  return res;
}
