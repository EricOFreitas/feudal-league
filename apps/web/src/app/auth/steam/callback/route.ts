import { NextResponse } from 'next/server';
import { db, players, users } from '@aoe2/db';
import { findPlayerBySteamId, importPlayerBySteamId, joinGlobalLeague, syncMatchHistory } from '@aoe2/sync';
import { eq } from 'drizzle-orm';
import { verifySteamCallback, appUrl } from '@/lib/steam-openid';
import { createSessionCookie } from '@/lib/session';

/** Depois do login: cria/atualiza o usuário, acha o jogador pela Steam e reivindica se estiver livre. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const stateCookie = req.headers.get('cookie')?.match(/aoe2_oid_state=([^;]+)/)?.[1];
  let next = '';
  let expected = '';
  try {
    const parsed = JSON.parse(decodeURIComponent(stateCookie ?? '')) as { state: string; next: string };
    expected = parsed.state; next = parsed.next;
  } catch { /* sem cookie: segue, mas falha abaixo */ }

  const fail = (reason: string) => {
    const r = NextResponse.redirect(`${appUrl()}/pt/login?error=${reason}`);
    r.cookies.set('aoe2_oid_state', '', { maxAge: 0, path: '/' });
    return r;
  };

  if (!expected || url.searchParams.get('state') !== expected) return fail('state');
  const steamId64 = await verifySteamCallback(url.searchParams);
  if (!steamId64) return fail('openid');

  const [user] = await db
    .insert(users)
    .values({ steamId64, lastLoginAt: new Date() })
    .onConflictDoUpdate({ target: users.steamId64, set: { lastLoginAt: new Date() } })
    .returning({ id: users.id });

  let player = await findPlayerBySteamId(steamId64);
  if (!player) {
    try {
      const imported = await importPlayerBySteamId(steamId64);
      if (imported) {
        await syncMatchHistory([imported.profileId]).catch(() => undefined);
        player = await findPlayerBySteamId(steamId64);
      }
    } catch { /* API fora: entra sem perfil, reivindica depois em /me */ }
  }
  let dest = next && next.startsWith('/') ? next : '/pt/me';
  if (player) {
    if (player.claimedByUserId == null) {
      await db.update(players).set({ claimedByUserId: user!.id }).where(eq(players.id, player.id));
      await joinGlobalLeague(player.id).catch(() => undefined);
    }
    if (!next) dest = `/pt/players/${player.profileId}?claimed=1`;
  }

  const res = NextResponse.redirect(`${appUrl()}${dest}`);
  res.cookies.set(await createSessionCookie({ uid: user!.id, sid: steamId64 }));
  res.cookies.set('aoe2_oid_state', '', { maxAge: 0, path: '/' });
  return res;
}
