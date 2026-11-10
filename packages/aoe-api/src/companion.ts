import { z } from 'zod';

/**
 * Busca de perfil por trecho do nick no aoe2companion (API aberta de terceiros, sem auth).
 * A API do jogo só acha o nick exato; esta serve de lista telefônica: devolve profile_ids
 * e o resto (rating, partidas) continua vindo da API do jogo. Não usar pra mais nada.
 * Medido em 10/11/2026: 20 perfis por página, sem diferenciar maiúsculas.
 */
const HOST = process.env.AOE2COMPANION_HOST ?? 'https://data.aoe2companion.com';

const searchResponse = z.object({
  count: z.number(),
  hasMore: z.boolean(),
  profiles: z.array(z.object({ profileId: z.number().int().positive() })),
});

export type CompanionSearch = { profileIds: number[]; hasMore: boolean };

export async function searchProfileIdsByName(query: string): Promise<CompanionSearch> {
  const url = new URL(`${HOST}/api/profiles`);
  url.searchParams.set('search', query);
  url.searchParams.set('page', '1');
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { 'user-agent': 'aoe2-ligas/0.1 (+portal de ligas; contato no site)' } });
  if (!res.ok) throw new Error(`aoe2companion: HTTP ${res.status}`);
  const parsed = searchResponse.safeParse(await res.json());
  if (!parsed.success) throw new Error(`aoe2companion: resposta inesperada: ${parsed.error.message.slice(0, 300)}`);
  return { profileIds: parsed.data.profiles.map((p) => p.profileId), hasMore: parsed.data.hasMore };
}
