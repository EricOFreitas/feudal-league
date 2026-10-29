/** Interpreta o que a pessoa colou no "adicionar jogador". */
export type PlayerInput =
  | { kind: 'steam_id64'; value: string }
  | { kind: 'steam_vanity'; value: string }
  | { kind: 'profile_id'; value: number }
  | { kind: 'alias'; value: string };

export function parsePlayerInput(raw: string): PlayerInput | null {
  const s = raw.trim();
  if (!s) return null;

  const url = /steamcommunity\.com\/(profiles|id)\/([^/?#\s]+)/i.exec(s);
  if (url) {
    const [, kind, value] = url;
    if (kind!.toLowerCase() === 'profiles' && /^\d{17}$/.test(value!)) return { kind: 'steam_id64', value: value! };
    if (kind!.toLowerCase() === 'id') return { kind: 'steam_vanity', value: value! };
    return null;
  }
  if (/^7656\d{13}$/.test(s)) return { kind: 'steam_id64', value: s };
  if (/^\d{1,9}$/.test(s)) return { kind: 'profile_id', value: Number(s) };
  if (s.length <= 40) return { kind: 'alias', value: s };
  return null;
}

/** Resolve URL amigável da Steam sem chave de API (steamcommunity.com/id/<vanity>?xml=1). */
export async function resolveSteamVanity(vanity: string): Promise<string | null> {
  const res = await fetch(`https://steamcommunity.com/id/${encodeURIComponent(vanity)}?xml=1`, {
    signal: AbortSignal.timeout(10_000),
    redirect: 'follow',
  });
  if (!res.ok) return null;
  const xml = await res.text();
  const m = /<steamID64>(\d{17})<\/steamID64>/.exec(xml);
  return m ? m[1]! : null;
}
