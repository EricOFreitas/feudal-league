/**
 * Análise de partida com IA (fase 2).
 *
 * Fluxo: pedido (web) → fila em match_analyses → worker: analyzer (replay → resumo JSON)
 * → modelo de linguagem via OpenRouter → feedback salvo. Leitura pública; pedido só do dono do perfil.
 *
 * Grátis, com limite diário por conta. Cobrança só com autorização da World's Edge (ver PLANO §3).
 */
import { civName, leaderboardOfMatchType } from '@aoe2/aoe-api';
import { db, matchAnalyses, matchMembers, matches, players, type MatchAnalysis } from '@aoe2/db';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { membershipsOf } from './leagues';

export const ANALYSIS_DAILY_LIMIT = Number(process.env.ANALYSIS_DAILY_LIMIT ?? 3);
export const DEFAULT_MODEL = process.env.LLM_MODEL ?? 'anthropic/claude-haiku-5.5';
const ANALYZER_URL = process.env.ANALYZER_URL ?? 'http://127.0.0.1:8000';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export type RequestReason = 'no_match' | 'not_member' | 'not_owner' | 'limit';
export type RequestResult = { ok: true; analysis: MatchAnalysis; created: boolean } | { ok: false; reason: RequestReason };

/** Quantas análises o usuário ainda pode pedir hoje (janela de 24 h). */
export async function remainingToday(userId: number): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(matchAnalyses)
    .where(and(eq(matchAnalyses.requestedByUserId, userId), gt(matchAnalyses.createdAt, since)));
  return Math.max(0, ANALYSIS_DAILY_LIMIT - (r?.n ?? 0));
}

export async function requestAnalysis(input: { matchId: number; profileId: number; userId: number; locale: string }): Promise<RequestResult> {
  const existing = await getAnalysis(input.matchId, input.profileId);
  if (existing) return { ok: true, analysis: existing, created: false };

  const match = await db.query.matches.findFirst({ where: eq(matches.id, input.matchId), with: { members: true } });
  if (!match) return { ok: false, reason: 'no_match' };
  if (!match.members.some((m) => m.profileId === input.profileId)) return { ok: false, reason: 'not_member' };
  const player = await db.query.players.findFirst({ where: eq(players.profileId, input.profileId) });
  if (!player || player.claimedByUserId !== input.userId) return { ok: false, reason: 'not_owner' };
  if ((await remainingToday(input.userId)) <= 0) return { ok: false, reason: 'limit' };

  const [row] = await db
    .insert(matchAnalyses)
    .values({ matchId: input.matchId, profileId: input.profileId, requestedByUserId: input.userId, locale: input.locale.startsWith('en') ? 'en' : 'pt' })
    .onConflictDoNothing()
    .returning();
  if (row) return { ok: true, analysis: row, created: true };
  const again = await getAnalysis(input.matchId, input.profileId);
  return again ? { ok: true, analysis: again, created: false } : { ok: false, reason: 'no_match' };
}

export async function getAnalysis(matchId: number, profileId: number) {
  return (await db.query.matchAnalyses.findFirst({ where: and(eq(matchAnalyses.matchId, matchId), eq(matchAnalyses.profileId, profileId)) })) ?? null;
}

/** Status das análises de um jogador para um conjunto de partidas (pra marcar a lista). */
export async function analysesForMatches(profileId: number, matchIds: number[]) {
  if (matchIds.length === 0) return new Map<number, string>();
  const rows = await db
    .select({ matchId: matchAnalyses.matchId, status: matchAnalyses.status })
    .from(matchAnalyses)
    .where(and(eq(matchAnalyses.profileId, profileId), inArray(matchAnalyses.matchId, matchIds)));
  return new Map(rows.map((r) => [r.matchId, r.status]));
}

/* ───────────────────────── processamento (worker) ───────────────────────── */

type ParseOut = {
  duration_s: number;
  header_ok: boolean;
  slots: Record<string, number>;
  players: Record<string, {
    profile_id: number | null; actions: number; apm: number;
    ages: Record<'feudal' | 'castle' | 'imperial', { click_s: number | null; reached_s: number | null } | null>;
    techs: { t_s: number; name: string }[]; units_queued: Record<string, number>;
    first_military: { t_s: number; unit: string } | null; buildings: Record<string, number>;
    building_first_s: Record<string, number>; villagers_queued_per_5min: number[]; military_queued_per_5min: number[];
    town_centers: number; market_s: number | null; walls: number; deletes: number; idle_gaps_60s: number; resigned_s: number | null;
    chat: { t_s: number; text: string }[];
  }>;
};

export class AnalyzerError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function parseReplay(matchId: number, profileIds: number[]): Promise<ParseOut> {
  const res = await fetch(`${ANALYZER_URL}/parse`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ game_id: matchId, profile_ids: profileIds }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AnalyzerError(`analyzer HTTP ${res.status}: ${body.slice(0, 200)}`, res.status);
  }
  return (await res.json()) as ParseOut;
}

const mmss = (s: number | null | undefined) => (s == null ? '–' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

/** Contexto completo pro prompt: partida + participantes + liga do jogador + resumo do replay. */
export async function analysisContext(matchId: number, profileId: number, parse: ParseOut) {
  const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId), with: { members: true } });
  if (!match) throw new Error('partida não encontrada');
  const me = match.members.find((m) => m.profileId === profileId);
  if (!me) throw new Error('jogador não participou');
  const player = await db.query.players.findFirst({ where: eq(players.profileId, profileId), with: { ratings: true } });
  const memberships = player ? await membershipsOf(player.id) : [];
  const division = memberships.find((m) => m.league.isGlobal) ?? memberships[0];

  const slotOf = new Map<number, string>(Object.entries(parse.slots).map(([slot, pid]) => [pid, slot]));
  const lines: string[] = [];
  const lb = leaderboardOfMatchType(match.matchtypeId);
  const kind = lb === 3 ? 'ranked 1v1 (Random Map)' : lb === 4 ? 'ranked team (Random Map)' : lb === 13 || lb === 14 ? 'Empire Wars' : match.matchtypeId === 0 ? 'lobby (unranked)' : `matchtype ${match.matchtypeId}`;
  lines.push(`Match ${match.id}: ${kind}, map ${match.mapName.replace(/\.rms$/, '')}, ${match.members.length} players, in-game duration ${mmss(parse.duration_s)} (Standard speed; clock as players see it).`);
  lines.push(`Analyzed player: ${me.alias ?? `#${profileId}`} (slot ${slotOf.get(profileId) ?? '?'}), civ ${civName(me.civId)}, team ${me.team}, rating ${me.oldRating} → ${me.newRating}, result: ${me.outcome === 1 ? 'WIN' : 'LOSS'}.`);
  if (division) lines.push(`League division: ${division.division.name ?? division.division.nameKey} (rating ${division.division.ratingMin}–${division.division.ratingMax ?? '∞'}), placed with rating ${division.placementRating}.`);

  lines.push('', 'Players:');
  for (const m of match.members) {
    const slot = slotOf.get(m.profileId);
    const p = slot ? parse.players[slot] : undefined;
    const role = m.profileId === profileId ? 'ANALYZED' : m.team === me.team ? 'ally' : 'opponent';
    const tcFirst = p?.building_first_s['Town Center'];
    const castleAt = p?.ages.castle?.reached_s;
    const tcDelay = tcFirst != null && castleAt != null ? `, first extra TC placed ${tcFirst - castleAt >= 0 ? '+' : ''}${tcFirst - castleAt}s after reaching Castle` : p?.town_centers === 1 ? ', no extra TC' : '';
    lines.push(`- slot ${slot ?? '?'} ${m.alias ?? `#${m.profileId}`} [${role}] civ ${civName(m.civId)}, rating ${m.oldRating}, ${m.outcome === 1 ? 'won' : 'lost'}` + (p ? `, APM ${p.apm}, ages: feudal click ${mmss(p.ages.feudal?.click_s)} reached ${mmss(p.ages.feudal?.reached_s)}, castle click ${mmss(p.ages.castle?.click_s)} reached ${mmss(p.ages.castle?.reached_s)}, imperial click ${mmss(p.ages.imperial?.click_s)}; first military ${p.first_military ? `${p.first_military.unit} at ${mmss(p.first_military.t_s)}` : 'none'}; town centers total ${p.town_centers}${tcDelay}; villagers queued ${p.units_queued['Villager'] ?? 0}` + (p.resigned_s != null ? `; resigned at ${mmss(p.resigned_s)}` : '') : ', (no replay data)'));
  }

  const mine = slotOf.get(profileId) ? parse.players[slotOf.get(profileId)!] : undefined;
  if (mine) {
    lines.push('', 'Analyzed player detail (in-game clock):');
    lines.push(`- Technologies: ${mine.techs.map((t) => `${t.name} ${mmss(t.t_s)}`).join(', ') || 'none'}`);
    lines.push(`- Units queued (total): ${Object.entries(mine.units_queued).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
    lines.push(`- Buildings placed (count): ${Object.entries(mine.buildings).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
    lines.push(`- First of each building: ${Object.entries(mine.building_first_s).map(([k, v]) => `${k} ${mmss(v)}`).join(', ')}`);
    lines.push(`- Villagers queued per 5-min window: ${mine.villagers_queued_per_5min.join(' / ')}`);
    lines.push(`- Military queued per 5-min window: ${mine.military_queued_per_5min.join(' / ')}`);
    lines.push(`- Market: ${mine.market_s != null ? mmss(mine.market_s) : 'never'}; wall segments ${mine.walls}; deletes ${mine.deletes}; gaps ≥60s without any command: ${mine.idle_gaps_60s}`);
    const chat = match.members.flatMap((m) => {
      const s = slotOf.get(m.profileId); const p = s ? parse.players[s] : undefined;
      return (p?.chat ?? []).map((c) => `${mmss(c.t_s)} ${m.alias ?? `#${m.profileId}`}: ${c.text}`);
    });
    if (chat.length) lines.push(`- Chat: ${chat.slice(0, 12).join(' | ')}`);
  }
  return { match, me, player, division, text: lines.join('\n'), hasReplayData: Boolean(mine) };
}

export function buildPrompt(locale: string, context: string) {
  const lang = locale.startsWith('en') ? 'English' : 'Brazilian Portuguese';
  const system = `You are an experienced Age of Empires II: Definitive Edition coach writing feedback for one player about one match they just played.

Write in ${lang}. Address the player directly ("you"/"você"). Be concrete, kind and honest; no filler, no generic advice that ignores the data.

GAME RULES YOU MUST RESPECT (do not contradict these):
- Ages: Dark → Feudal → Castle → Imperial. Feudal Age costs 500 food; Castle 800 food + 200 gold; Imperial 1000 food + 800 gold.
- Extra Town Centers can only be built in Castle Age or later (exception: Cumans may build one extra TC in Feudal). Building 2–3 extra TCs right after reaching Castle Age is standard good play, not a delay.
- Villager production should be continuous from every TC from 0:00 until roughly 100–120 villagers (1v1) — that is around 25–35 minutes of in-game clock at good levels, not 10 minutes. Population cap is 200.
- Economy upgrades by age — Dark: Loom (TC). Feudal: Double-Bit Axe (lumber camp, wood), Horse Collar (mill, farms), Wheelbarrow (TC, villager speed and carry), Gold Mining, Stone Mining. Castle: Bow Saw, Heavy Plow, Hand Cart, Gold Shaft Mining, Stone Shaft Mining. Imperial: Two-Man Saw, Crop Rotation. Never place a tech in the wrong age.
- Age-up click is when the research was queued; arrival is when it completed. Feudal research takes 130 s, Castle 160 s, Imperial 190 s. Judge timing by arrival.
- Rough benchmarks on the in-game clock (Standard speed, open maps; approximate, say "roughly"): Feudal arrival — pros ~9:30–10:30, 1200–1500 ~11:00–12:30, below 1100 ~12:30–14:30. Castle arrival — pros ~16:00–18:30, 1200–1500 ~20:00–24:00, below 1100 ~24:00–30:00. Team-game pockets are often faster than flanks.

Data limits you must respect: the recorded game stores COMMANDS, not game state. You know when things were queued, researched, placed or clicked, and the in-game clock when each age was reached, but you do NOT know resources in stock, idle villager time, units actually produced, kills or losses. Never invent such numbers. When you infer (e.g. a long gap between queues suggests idle production), say it is an inference.

Keep unit, building and technology names in English (e.g. Horse Collar, Wheelbarrow, Town Center); Brazilian players use them that way and translations are error-prone.

Use the in-game clock in mm:ss. Compare the player mostly with the other players in the SAME match (same map, same conditions). Always count villagers per 5-minute window against "continuous production from all TCs" (one TC produces 12 villagers per 5 minutes at most).

Format (Markdown, max ~450 words):
## Resumo / Summary — 2–3 sentences on what decided the game for this player.
## Abertura — Dark/Feudal timing and build order vs the others in the match.
## Economia e produção — villager flow, town centers, upgrades, market.
## Militar — first military, composition, timing vs the opponents' ages and compositions.
## Três próximos passos — exactly 3 bullets, each one specific habit to practice next games, each consistent with the game rules above.
(Translate headings to the output language. Do not add other sections.)`;
  const user = `Match data:\n\n${context}\n\nWrite the feedback now.`;
  return { system, user };
}

export type LlmResult = { text: string; promptTokens: number | null; completionTokens: number | null; costMicroUsd: number | null };

export async function callLlm(model: string, prompt: { system: string; user: string }, opts: { maxTokens?: number } = {}): Promise<LlmResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY não definida');
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`, 'content-type': 'application/json',
      'HTTP-Referer': process.env.APP_URL ?? 'https://feudalleague.com', 'X-Title': 'Feudal League',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }],
      // Modelos com raciocínio (Haiku 5.5, GPT-5) gastam tokens pensando antes de responder:
      // orçamento folgado e esforço baixo, senão o texto volta vazio com finish_reason=length.
      max_tokens: opts.maxTokens ?? 4000,
      reasoning: { effort: 'low' },
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string }; choices?: { finish_reason?: string; message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  };
  if (!res.ok || body.error) throw new Error(`OpenRouter HTTP ${res.status}: ${body.error?.message ?? ''}`.trim());
  const choice = body.choices?.[0];
  const text = choice?.message?.content?.trim() ?? '';
  if (!text) throw new Error(`OpenRouter devolveu resposta vazia (finish_reason=${choice?.finish_reason ?? '?'})`);
  return {
    text,
    promptTokens: body.usage?.prompt_tokens ?? null,
    completionTokens: body.usage?.completion_tokens ?? null,
    costMicroUsd: body.usage?.cost != null ? Math.round(body.usage.cost * 1e6) : null,
  };
}

/** Processa a fila. Uma por vez; devolve quantas concluiu (com sucesso ou falha). */
export async function processQueuedAnalyses(limit = 3): Promise<number> {
  const queued = await db.query.matchAnalyses.findMany({ where: eq(matchAnalyses.status, 'queued'), orderBy: (t, { asc }) => [asc(t.createdAt)], limit });
  let n = 0;
  for (const a of queued) {
    const claimed = await db.update(matchAnalyses).set({ status: 'parsing', startedAt: new Date() }).where(and(eq(matchAnalyses.id, a.id), eq(matchAnalyses.status, 'queued'))).returning({ id: matchAnalyses.id });
    if (claimed.length === 0) continue;
    try {
      const members = await db.select({ profileId: matchMembers.profileId }).from(matchMembers).where(eq(matchMembers.matchId, a.matchId));
      const ids = [a.profileId, ...members.map((m) => m.profileId).filter((p) => p !== a.profileId)];
      const parse = await parseReplay(a.matchId, ids);
      await db.update(matchAnalyses).set({ status: 'writing', parse }).where(eq(matchAnalyses.id, a.id));
      const ctx = await analysisContext(a.matchId, a.profileId, parse);
      if (!ctx.hasReplayData) throw new Error('jogador não identificado no replay');
      const llm = await callLlm(DEFAULT_MODEL, buildPrompt(a.locale, ctx.text));
      await db.update(matchAnalyses).set({
        status: 'done', model: DEFAULT_MODEL, feedback: llm.text, promptTokens: llm.promptTokens, completionTokens: llm.completionTokens,
        costMicroUsd: llm.costMicroUsd, finishedAt: new Date(), error: null,
      }).where(eq(matchAnalyses.id, a.id));
    } catch (e) {
      const msg = e instanceof AnalyzerError && e.status === 404 ? 'replay_unavailable' : (e as Error).message.slice(0, 500);
      await db.update(matchAnalyses).set({ status: 'failed', error: msg, finishedAt: new Date() }).where(eq(matchAnalyses.id, a.id));
    }
    n++;
  }
  return n;
}

/** Recoloca na fila uma análise que falhou. Só o dono; não conta de novo no limite. */
export async function retryAnalysis(matchId: number, profileId: number, userId: number): Promise<boolean> {
  const player = await db.query.players.findFirst({ where: eq(players.profileId, profileId) });
  if (!player || player.claimedByUserId !== userId) return false;
  const r = await db.update(matchAnalyses).set({ status: 'queued', error: null, startedAt: null, finishedAt: null })
    .where(and(eq(matchAnalyses.matchId, matchId), eq(matchAnalyses.profileId, profileId), eq(matchAnalyses.status, 'failed'))).returning({ id: matchAnalyses.id });
  return r.length > 0;
}
