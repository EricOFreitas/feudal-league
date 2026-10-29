import 'server-only';

/** Steam OpenID 2.0 — fluxo mínimo, sem biblioteca. https://steamcommunity.com/dev */
const PROVIDER = 'https://steamcommunity.com/openid/login';
const NS = 'http://specs.openid.net/auth/2.0';
const ID_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';

export function appUrl() {
  const u = process.env.APP_URL;
  if (!u) throw new Error('APP_URL não definida');
  return u.replace(/\/$/, '');
}

export function steamLoginUrl(state: string) {
  const p = new URLSearchParams({
    'openid.ns': NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': `${appUrl()}/auth/steam/callback?state=${encodeURIComponent(state)}`,
    'openid.realm': appUrl(),
    'openid.identity': ID_SELECT,
    'openid.claimed_id': ID_SELECT,
  });
  return `${PROVIDER}?${p}`;
}

/** Valida a resposta junto à Steam e devolve o SteamID64, ou null. */
export async function verifySteamCallback(query: URLSearchParams): Promise<string | null> {
  if (query.get('openid.mode') !== 'id_res') return null;
  const returnTo = query.get('openid.return_to') ?? '';
  if (!returnTo.startsWith(`${appUrl()}/auth/steam/callback`)) return null;

  const claimed = query.get('openid.claimed_id') ?? '';
  const m = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(claimed);
  if (!m) return null;

  const body = new URLSearchParams();
  for (const [k, v] of query) if (k.startsWith('openid.')) body.set(k, v);
  body.set('openid.mode', 'check_authentication');

  const res = await fetch(PROVIDER, { method: 'POST', body, signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  if (!res.ok || !/is_valid\s*:\s*true/.test(text)) return null;
  return m[1]!;
}
