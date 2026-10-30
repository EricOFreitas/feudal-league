import type { z } from 'zod';
import {
  leaderboardResponse,
  matchHistoryResponse,
  personalStatResponse,
  type LeaderboardStat,
  type Member,
} from './schemas';

/**
 * Cliente do backend do jogo (World's Edge / Relic Link).
 * API não documentada e sem garantia. Este arquivo é o ÚNICO lugar que conhece o host.
 * Medido em 29/10/2026: getPersonalStat com 100 ids = 1,4 s / 210 KB;
 * getRecentMatchHistory com 20 ids = 4,7 s / 7 MB. Lotes de histórico ficam em 10.
 */
const HOST = process.env.AOE_API_HOST ?? 'https://aoe-api.worldsedgelink.com';
const BASE = `${HOST}/community/leaderboard`;
const TITLE = 'age2';

export const BATCH_PERSONAL_STAT = 100;
export const BATCH_MATCH_HISTORY = 10;

export class AoeApiError extends Error {
  constructor(message: string, public status?: number, public body?: string) {
    super(message);
    this.name = 'AoeApiError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Espaçamento mínimo entre chamadas (2 req/s) + backoff em 429/5xx. */
let lastCallAt = 0;
const MIN_INTERVAL_MS = 500;

async function call<T>(path: string, params: Record<string, string>, schema: z.ZodType<T>): Promise<T> {
  const url = new URL(`${BASE}/${path}`);
  url.searchParams.set('title', TITLE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let attempt = 0;
  for (;;) {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();

    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { 'user-agent': 'aoe2-ligas/0.1 (+portal de ligas; contato no site)' } });
    } catch (e) {
      if (attempt++ < 3) { await sleep(1000 * 2 ** attempt); continue; }
      throw new AoeApiError(`falha de rede em ${path}: ${(e as Error).message}`);
    }

    if (res.status === 429 || res.status >= 500) {
      const body = await res.text().catch(() => '');
      if (attempt++ < 4) { await sleep(1000 * 2 ** attempt); continue; }
      throw new AoeApiError(`HTTP ${res.status} em ${path}`, res.status, body.slice(0, 500));
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new AoeApiError(`HTTP ${res.status} em ${path}`, res.status, body.slice(0, 500));
    }
    const json = await res.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new AoeApiError(`resposta inesperada em ${path}: ${parsed.error.message.slice(0, 300)}`);
    return parsed.data;
  }
}

function assertOk(result: { code: number; message: string }, path: string) {
  if (result.code !== 0) throw new AoeApiError(`${path}: code ${result.code} ${result.message}`);
}

/** Nick/id inexistente: a API responde 200 com code 9 (UNKNOWN_ALIASES / UNKNOWN_PROFILE_IDS). Não é falha: é "não achei". */
const isUnknown = (result: { code: number }) => result.code === 9;

export type PersonalStats = { members: Member[]; stats: LeaderboardStat[] };

export async function getPersonalStatByProfileIds(profileIds: number[]): Promise<PersonalStats> {
  if (profileIds.length === 0) return { members: [], stats: [] };
  const d = await call('getPersonalStat', { profile_ids: JSON.stringify(profileIds) }, personalStatResponse);
  if (isUnknown(d.result)) return { members: [], stats: [] };
  assertOk(d.result, 'getPersonalStat');
  return { members: d.statGroups.flatMap((g) => g.members), stats: d.leaderboardStats };
}

/** Nome exato na API: "/steam/<id64>". Serve pra achar o profile_id a partir do Steam. */
export async function getPersonalStatByNames(names: string[]): Promise<PersonalStats> {
  if (names.length === 0) return { members: [], stats: [] };
  const d = await call('getPersonalStat', { profile_names: JSON.stringify(names) }, personalStatResponse);
  if (isUnknown(d.result)) return { members: [], stats: [] };
  assertOk(d.result, 'getPersonalStat');
  return { members: d.statGroups.flatMap((g) => g.members), stats: d.leaderboardStats };
}

/** Busca por nick: EXATA e sensível a maiúsculas. Devolve todos os homônimos. */
export async function getPersonalStatByAliases(aliases: string[]): Promise<PersonalStats> {
  if (aliases.length === 0) return { members: [], stats: [] };
  const d = await call('getPersonalStat', { aliases: JSON.stringify(aliases) }, personalStatResponse);
  if (isUnknown(d.result)) return { members: [], stats: [] };
  assertOk(d.result, 'getPersonalStat');
  return { members: d.statGroups.flatMap((g) => g.members), stats: d.leaderboardStats };
}

export async function getRecentMatchHistory(profileIds: number[]) {
  if (profileIds.length === 0) return { matches: [], profiles: [] as Member[] };
  const d = await call('getRecentMatchHistory', { profile_ids: JSON.stringify(profileIds) }, matchHistoryResponse);
  assertOk(d.result, 'getRecentMatchHistory');
  return { matches: d.matchHistoryStats, profiles: d.profiles };
}

export async function getLeaderboard(leaderboardId: number, start = 1, count = 100) {
  const d = await call(
    'getLeaderBoard2',
    { leaderboard_id: String(leaderboardId), start: String(start), count: String(count), sortBy: '1' },
    leaderboardResponse,
  );
  assertOk(d.result, 'getLeaderBoard2');
  return { members: d.statGroups.flatMap((g) => g.members), stats: d.leaderboardStats };
}

/** Junta member + stats do mesmo jogador (ligados por statgroup_id). */
export function joinStats(ps: PersonalStats): Map<number, { member: Member; stats: LeaderboardStat[] }> {
  const byGroup = new Map<number, Member>();
  for (const m of ps.members) byGroup.set(m.personal_statgroup_id, m);
  const out = new Map<number, { member: Member; stats: LeaderboardStat[] }>();
  for (const m of ps.members) out.set(m.profile_id, { member: m, stats: [] });
  for (const s of ps.stats) {
    const m = byGroup.get(s.statgroup_id);
    if (m) out.get(m.profile_id)!.stats.push(s);
  }
  return out;
}

export function steamIdFromName(name: string): string | null {
  const m = /^\/steam\/(\d{17})$/.exec(name);
  return m ? m[1]! : null;
}
