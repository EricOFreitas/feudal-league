import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/session';
import { appUrl } from '@/lib/steam-openid';

export async function GET() {
  const res = NextResponse.redirect(`${appUrl()}/`);
  res.cookies.set(clearSessionCookie());
  return res;
}
