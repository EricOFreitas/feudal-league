/**
 * Avisos no Discord por webhook (fase 4).
 *
 * Contrato
 * - Tela do dono da liga (apps/web …/leagues/[slug]/discord) usa getLeagueWebhook, saveLeagueWebhook,
 *   deleteLeagueWebhook e sendDiscordTest. A URL nunca sai do servidor: a tela recebe só maskWebhookUrl(url).
 * - O worker chama processNotifications() a cada ciclo. Devolve quantos embeds o Discord aceitou.
 *
 * Decisões
 * - Um webhook por liga nesta versão. A tabela aceita vários; a tela gerencia o primeiro (menor id), e o
 *   processamento já trata N webhooks por liga (cada um com seus eventos e divisões).
 * - Fila = colunas notified_at. Pendente:
 *     match       league_matches  status counted, notified_at null
 *     voided      league_matches  status voided com notified_at null ou < updated_at (anulada)
 *                                 status counted com notified_at < updated_at (restaurada)
 *     tournament  tournament_games notified_at null (só torneio com league_id)
 *     member      league_members  notified_at null e left_at null
 *     season      seasons         ended_at preenchido e notified_at null
 * - notified_at é marcado SEMPRE, com ou sem webhook, com o evento ligado ou não: quem liga o webhook
 *   depois não recebe o histórico inteiro de uma vez.
 * - Marca antes de enviar (UPDATE … RETURNING com a condição de pendente): dois workers não mandam o
 *   mesmo aviso, e envio lento não duplica. Se o Discord recusar, o aviso se perde e o erro fica em
 *   last_error (a tela mostra).
 * - Até MAX_EMBEDS_PER_CYCLE embeds por webhook por ciclo, numa mensagem só. O resto fica pendente pro
 *   próximo ciclo, em ordem de acontecimento.
 * - Anulação/restauração depende de league_matches.updated_at subir quando o status muda.
 * - Inscrição criada pela virada de temporada (joined_at = started_at da temporada nova) não vira
 *   "novo membro": é recolocação, não gente nova.
 * - Texto em português: a liga é brasileira e o Discord não tem i18n nesta versão.
 */
import {
  db, divisions, leagueMatches, leagueMembers, leagueWebhooks, leagues, seasons, tournamentGames, tournamentMatches, tournaments,
  type LeagueWebhook,
} from '@aoe2/db';
import { and, asc, eq, inArray, isNotNull, isNull, lt, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { POINTS_LOSS, POINTS_WIN, standings } from './leagues';

export const WEBHOOK_EVENTS = ['match', 'voided', 'tournament', 'member', 'season'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export const DEFAULT_WEBHOOK_EVENTS: WebhookEvent[] = ['match', 'voided', 'tournament', 'season'];
export const WEBHOOK_URL_RE = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\S+$/;
/** Embeds por webhook em cada ciclo do worker (uma mensagem; o Discord aceita até 10). */
export const MAX_EMBEDS_PER_CYCLE = 5;
/** Linhas pendentes lidas por tipo em cada ciclo, só das ligas com webhook. */
const LOAD_LIMIT = 200;
const USERNAME = 'Feudal League';

export const EMBED_COLORS = {
  match: 0x4f7a3a, restored: 0x4f7a3a, voided: 0xa6342e, tournament: 0xd4af5a, member: 0x3b6ea8, season: 0xe9cf8a, test: 0xd4af5a,
} as const;

export type DiscordEmbed = { title: string; description: string; color: number; footer: { text: string }; url?: string };

/* ───────────────────────────── URL ───────────────────────────── */

export function isDiscordWebhookUrl(raw: string): boolean {
  const url = raw.trim();
  if (!WEBHOOK_URL_RE.test(url)) return false;
  try {
    const u = new URL(url);
    return (u.hostname === 'discord.com' || u.hostname === 'discordapp.com') && u.pathname.startsWith('/api/webhooks/') && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Versão pra tela: id do webhook + 4 caracteres do token + "…". O token é o segredo. */
export function maskWebhookUrl(url: string): string {
  const m = /^(https:\/\/[^/]+\/api\/webhooks\/[^/]+\/)(.{0,4})/.exec(url);
  return m ? `${m[1]}${m[2]}…` : `${url.slice(0, 36)}…`;
}

/* ───────────────────────────── CRUD ───────────────────────────── */

export async function getLeagueWebhook(leagueId: number): Promise<LeagueWebhook | undefined> {
  return db.query.leagueWebhooks.findFirst({ where: eq(leagueWebhooks.leagueId, leagueId), orderBy: [asc(leagueWebhooks.id)] });
}

export type SaveWebhookInput = { url: string; events: string[]; divisionIds: number[] | null; enabled: boolean };
export type SaveWebhookResult = { ok: true; webhook: LeagueWebhook } | { ok: false; reason: 'url' };

/** Cria ou atualiza o webhook da liga. Eventos desconhecidos são descartados; divisões são filtradas pelas da liga. */
export async function saveLeagueWebhook(leagueId: number, input: SaveWebhookInput): Promise<SaveWebhookResult> {
  const url = input.url.trim();
  if (!isDiscordWebhookUrl(url)) return { ok: false, reason: 'url' };
  const events = WEBHOOK_EVENTS.filter((e) => input.events.includes(e));
  let divisionIds: number[] | null = null;
  if (input.divisionIds) {
    const divs = await db.select({ id: divisions.id }).from(divisions).where(eq(divisions.leagueId, leagueId));
    const valid = divs.map((d) => d.id).filter((id) => input.divisionIds!.includes(id));
    divisionIds = valid.length === divs.length ? null : valid; // todas marcadas = null (inclui divisões criadas depois)
  }
  const current = await getLeagueWebhook(leagueId);
  if (current) {
    const [row] = await db.update(leagueWebhooks)
      .set({ url, events, divisionIds, enabled: input.enabled, ...(current.url !== url ? { lastError: null } : {}) })
      .where(eq(leagueWebhooks.id, current.id)).returning();
    return { ok: true, webhook: row! };
  }
  const [row] = await db.insert(leagueWebhooks).values({ leagueId, url, events, divisionIds, enabled: input.enabled }).returning();
  return { ok: true, webhook: row! };
}

export async function deleteLeagueWebhook(leagueId: number) {
  await db.delete(leagueWebhooks).where(eq(leagueWebhooks.leagueId, leagueId));
}

/* ───────────────────────────── envio ───────────────────────────── */

export type SendResult = { ok: true } | { ok: false; error: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** POST no webhook. 429: espera retry_after (até 15 s) e tenta de novo uma vez. */
async function postToDiscord(url: string, embeds: DiscordEmbed[]): Promise<SendResult> {
  const body = JSON.stringify({
    username: USERNAME,
    allowed_mentions: { parse: [] }, // nome de jogador com @everyone não pinga ninguém
    embeds: embeds.map((e) => ({ ...e, title: cut(e.title, 256), description: cut(e.description, 4096), footer: { text: cut(e.footer.text, 2048) } })),
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, redirect: 'error', signal: AbortSignal.timeout(10_000) });
    } catch (err) {
      return { ok: false, error: `Sem resposta do Discord: ${(err as Error).message}` };
    }
    if (res.ok) return { ok: true };
    const text = await res.text().catch(() => '');
    let json: { message?: string; retry_after?: number } = {};
    try { json = JSON.parse(text) as typeof json; } catch { /* corpo não é JSON */ }
    if (res.status === 429 && attempt === 0) {
      const wait = Number(json.retry_after ?? res.headers.get('retry-after') ?? 1);
      await sleep(Math.min(15, Math.max(0.2, Number.isFinite(wait) ? wait : 1)) * 1000);
      continue;
    }
    if (res.status === 404) return { ok: false, error: 'O webhook não existe mais no Discord (404). Crie outro e cole a URL nova.' };
    if (res.status === 401 || res.status === 403) return { ok: false, error: `O Discord recusou o webhook (${res.status}). Confira a URL.` };
    return { ok: false, error: cut(`Discord respondeu ${res.status}${json.message ? `: ${json.message}` : text ? `: ${text}` : ''}`, 300) };
  }
  return { ok: false, error: 'O Discord limitou o envio (429). Tenta de novo no próximo ciclo.' };
}

async function recordResult(webhookId: number, r: SendResult) {
  await db.update(leagueWebhooks)
    .set(r.ok ? { lastSentAt: new Date(), lastError: null } : { lastError: r.error })
    .where(eq(leagueWebhooks.id, webhookId));
}

async function sendTo(hook: LeagueWebhook, embeds: DiscordEmbed[]): Promise<SendResult> {
  const r = await postToDiscord(hook.url, embeds);
  await recordResult(hook.id, r);
  return r;
}

/* ───────────────────────────── texto ───────────────────────────── */

const DIVISION_PT: Record<string, string> = { shield: 'Escudo', lance: 'Lança', banner: 'Estandarte', tower: 'Torre', castle: 'Castelo', crown: 'Coroa' };
/** Nome da divisão como sai no Discord (português). */
export const discordDivisionName = (d: { name: string | null; nameKey: string | null }) => d.name ?? (d.nameKey ? DIVISION_PT[d.nameKey] ?? d.nameKey : '?');
const leagueName = (l: { name: string; isGlobal: boolean }) => (l.isGlobal ? 'Liga Global' : l.name);
const mapName = (raw: string | null | undefined) => (raw ? raw.replace(/\.rms$/i, '').replace(/[_-]+/g, ' ').trim() : 'mapa desconhecido');
const dtf = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const formatDiscordDate = (d: Date) => dtf.format(d).replace(', ', ' às ');
const pts = (n: number) => `${n} ${n === 1 ? 'pt' : 'pts'}`;

function appUrl(path: string): string | undefined {
  const base = process.env.APP_URL?.replace(/\/+$/, '');
  return base?.startsWith('https://') ? `${base}/pt${path}` : undefined;
}

type MatchText = { winner: string; loser: string; division: string; map: string; lobby: boolean; minutes: number; pw?: number; pl?: number };

export function matchEmbed(m: MatchText, league: string, at: Date, url?: string): DiscordEmbed {
  return {
    title: `${m.winner} venceu ${m.loser}`,
    description: `${m.division} · ${m.map} · ${m.lobby ? 'lobby' : 'ranqueada'} · ${m.minutes} min. ${m.winner} +${pts(m.pw ?? POINTS_WIN)} · ${m.loser} +${pts(m.pl ?? POINTS_LOSS)}.`,
    color: EMBED_COLORS.match, footer: { text: `${league} · ${formatDiscordDate(at)}` }, url,
  };
}

export function voidedEmbed(m: { winner: string; loser: string; division: string; reason: string | null }, league: string, at: Date, url?: string): DiscordEmbed {
  return {
    title: 'Partida anulada',
    description: `${m.winner} × ${m.loser} (${m.division})${m.reason ? `: ${m.reason.replace(/[.!?]+$/, '')}.` : '.'} Não conta pontos.`,
    color: EMBED_COLORS.voided, footer: { text: `${league} · ${formatDiscordDate(at)}` }, url,
  };
}

export function restoredEmbed(m: { winner: string; loser: string; division: string; pw?: number; pl?: number }, league: string, at: Date, url?: string): DiscordEmbed {
  return {
    title: 'Partida restaurada',
    description: `${m.winner} venceu ${m.loser} (${m.division}) e a partida volta a contar: ${m.winner} +${pts(m.pw ?? POINTS_WIN)} · ${m.loser} +${pts(m.pl ?? POINTS_LOSS)}.`,
    color: EMBED_COLORS.restored, footer: { text: `${league} · ${formatDiscordDate(at)}` }, url,
  };
}

type TournamentText = {
  tournament: string; round: string; teamA: string; teamB: string; scoreA: number; scoreB: number; bestOf: number;
  /** Confronto fechou neste jogo: quem venceu e o que isso quer dizer. */
  closed: { winner: string; outcome: 'champion' | 'advances' | 'group' } | null;
};

export function tournamentEmbed(g: TournamentText, league: string, at: Date, url?: string): DiscordEmbed {
  const score = `${g.teamA} ${g.scoreA}–${g.scoreB} ${g.teamB}${g.bestOf > 1 ? ` (melhor de ${g.bestOf})` : ''}`;
  const tail = !g.closed ? '' : g.closed.outcome === 'champion' ? ` ${g.closed.winner} é campeão do ${g.tournament}.`
    : g.closed.outcome === 'advances' ? ` ${g.closed.winner} avança.` : ` ${g.closed.winner} vence o confronto.`;
  return { title: `${g.tournament} · ${g.round}`, description: `${score}.${tail}`, color: EMBED_COLORS.tournament, footer: { text: `${league} · ${formatDiscordDate(at)}` }, url };
}

export function memberEmbed(m: { player: string; division: string; rating: number }, league: string, at: Date, url?: string): DiscordEmbed {
  return {
    title: `Novo membro: ${m.player}`,
    description: `${m.player} entrou na divisão ${m.division} (rating de colocação ${m.rating}).`,
    color: EMBED_COLORS.member, footer: { text: `${league} · ${formatDiscordDate(at)}` }, url,
  };
}

type SeasonDivision = { divisionId: number; division: string; podium: { player: string; points: number }[] };

export function seasonEmbed(s: { number: number; divisions: SeasonDivision[] }, league: string, at: Date, url?: string): DiscordEmbed {
  const lines = s.divisions.map((d) => {
    if (d.podium.length === 0) return `**${d.division}**: sem partidas.`;
    const [first, ...rest] = d.podium;
    return `**${d.division}**: campeão ${first!.player} (${pts(first!.points)})${rest.map((p, i) => ` · ${i + 2}º ${p.player} (${pts(p.points)})`).join('')}`;
  });
  return {
    title: `Temporada ${s.number} encerrada`,
    description: lines.length ? lines.join('\n') : 'Sem divisões neste canal.',
    color: EMBED_COLORS.season, footer: { text: `${league} · ${formatDiscordDate(at)}` }, url,
  };
}

/** Exemplos da prévia da tela, montados com as mesmas funções do envio real. */
export function previewEmbeds(league: string, division: string, at = new Date()): Record<WebhookEvent, DiscordEmbed> {
  return {
    match: matchEmbed({ winner: 'Ceifador', loser: 'Tora', division, map: 'Arabia', lobby: true, minutes: 31 }, league, at),
    voided: voidedEmbed({ winner: 'Bruma', loser: 'Lobo Frio', division, reason: 'desconexão no minuto 2' }, league, at),
    tournament: tournamentEmbed({ tournament: 'Copa de Novembro', round: 'Semifinal', teamA: 'Ceifador', teamB: 'Bruma', scoreA: 2, scoreB: 1, bestOf: 3, closed: { winner: 'Ceifador', outcome: 'advances' } }, league, at),
    member: memberEmbed({ player: 'Lobo Frio', division, rating: 1012 }, league, at),
    season: seasonEmbed({ number: 3, divisions: [{ divisionId: 0, division, podium: [{ player: 'Ceifador', points: 31 }, { player: 'Tora', points: 27 }, { player: 'Bruma', points: 22 }] }] }, league, at),
  };
}

/** Manda um embed de teste pra URL salva e grava last_sent_at/last_error. */
export async function sendDiscordTest(leagueId: number): Promise<SendResult> {
  const hook = await getLeagueWebhook(leagueId);
  if (!hook) return { ok: false, error: 'Sem webhook salvo.' };
  const league = await db.query.leagues.findFirst({ where: eq(leagues.id, leagueId) });
  const name = league ? leagueName(league) : 'Liga';
  return sendTo(hook, [{
    title: 'Mensagem de teste',
    description: `Webhook ligado. Os avisos da ${name} vão chegar neste canal.`,
    color: EMBED_COLORS.test, footer: { text: `${name} · ${formatDiscordDate(new Date())}` }, url: league ? appUrl(`/leagues/${league.slug}`) : undefined,
  }]);
}

/* ───────────────────────────── fila ───────────────────────────── */

/** Aviso pendente. mark() devolve false se outro processo já marcou (ou a linha mudou): aí não envia. */
type Item = {
  leagueId: number;
  event: WebhookEvent;
  at: Date;
  /** null = não depende de divisão (torneio, temporada). */
  divisionId: number | null;
  /** null = marca sem enviar (ex.: recolocação da virada de temporada). */
  build: ((hook: LeagueWebhook) => DiscordEmbed) | null;
  mark: () => Promise<boolean>;
};

const wants = (hook: LeagueWebhook, it: Item) =>
  it.build != null && (hook.events ?? []).includes(it.event) && (it.divisionId == null || hook.divisionIds == null || hook.divisionIds.includes(it.divisionId));

const pendingMatch = and(inArray(leagueMatches.status, ['counted', 'voided']), or(isNull(leagueMatches.notifiedAt), lt(leagueMatches.notifiedAt, leagueMatches.updatedAt)))!;
/** notified_at nunca fica atrás de updated_at, mesmo com relógio do web adiantado em relação ao banco. */
const notifiedNow = sql`greatest(now(), ${leagueMatches.updatedAt})`;

/** Marca de uma vez tudo o que é de liga sem webhook ligado (e o que nunca vira aviso). */
async function markWithoutHooks(hookLeagueIds: number[]) {
  const outside = (col: Parameters<typeof notInArray>[0]): SQL | undefined => (hookLeagueIds.length ? notInArray(col, hookLeagueIds) : undefined);
  await db.update(leagueMatches).set({ notifiedAt: notifiedNow }).where(and(pendingMatch, outside(leagueMatches.leagueId)));
  await db.update(leagueMembers).set({ notifiedAt: sql`now()` })
    .where(and(isNull(leagueMembers.notifiedAt), hookLeagueIds.length ? or(isNotNull(leagueMembers.leftAt), notInArray(leagueMembers.leagueId, hookLeagueIds)) : undefined));
  await db.update(seasons).set({ notifiedAt: sql`now()` }).where(and(isNotNull(seasons.endedAt), isNull(seasons.notifiedAt), outside(seasons.leagueId)));
  const tmOutside = db.select({ id: tournamentMatches.id }).from(tournamentMatches).innerJoin(tournaments, eq(tournaments.id, tournamentMatches.tournamentId))
    .where(hookLeagueIds.length ? or(isNull(tournaments.leagueId), notInArray(tournaments.leagueId, hookLeagueIds)) : undefined);
  await db.update(tournamentGames).set({ notifiedAt: sql`now()` }).where(and(isNull(tournamentGames.notifiedAt), inArray(tournamentGames.tournamentMatchId, tmOutside)));
}

async function loadItems(hookLeagueIds: number[]): Promise<Item[]> {
  const items: Item[] = [];
  const leagueRows = await db.query.leagues.findMany({ where: inArray(leagues.id, hookLeagueIds) });
  const byLeague = new Map(leagueRows.map((l) => [l.id, l]));
  const lname = (id: number) => { const l = byLeague.get(id); return l ? leagueName(l) : 'Liga'; };
  const lurl = (id: number) => { const l = byLeague.get(id); return l ? appUrl(`/leagues/${l.slug}`) : undefined; };

  // partidas: nova, anulada, restaurada
  const lms = await db.query.leagueMatches.findMany({
    where: and(pendingMatch, inArray(leagueMatches.leagueId, hookLeagueIds)),
    with: { winner: { columns: { alias: true } }, loser: { columns: { alias: true } }, division: true, match: { columns: { mapName: true, matchtypeId: true, startedAt: true, completedAt: true } } },
    orderBy: [asc(leagueMatches.updatedAt)], limit: LOAD_LIMIT,
  });
  for (const lm of lms) {
    const lg = byLeague.get(lm.leagueId);
    const base = { winner: lm.winner.alias, loser: lm.loser.alias, division: discordDivisionName(lm.division), pw: lg?.pointsWin, pl: lg?.pointsLoss };
    const isNew = lm.status === 'counted' && lm.notifiedAt == null;
    const event: WebhookEvent = isNew ? 'match' : 'voided';
    const at = isNew ? lm.playedAt : lm.updatedAt;
    const loadedUpdatedAt = lm.updatedAt;
    items.push({
      leagueId: lm.leagueId, event, at: isNew ? lm.createdAt : lm.updatedAt, divisionId: lm.divisionId,
      build: () => lm.status === 'voided' ? voidedEmbed({ ...base, reason: lm.voidReason }, lname(lm.leagueId), at, lurl(lm.leagueId))
        : isNew ? matchEmbed({ ...base, map: mapName(lm.match.mapName), lobby: lm.match.matchtypeId === 0, minutes: Math.round((lm.match.completedAt.getTime() - lm.match.startedAt.getTime()) / 60000) }, lname(lm.leagueId), at, lurl(lm.leagueId))
        : restoredEmbed(base, lname(lm.leagueId), at, lurl(lm.leagueId)),
      // só marca se a linha não mudou desde a leitura (Date do JS corta o microssegundo: margem de 1 ms)
      mark: async () => (await db.update(leagueMatches).set({ notifiedAt: notifiedNow })
        .where(and(eq(leagueMatches.id, lm.id), pendingMatch, sql`${leagueMatches.updatedAt} < ${loadedUpdatedAt.toISOString()}::timestamptz + interval '1 millisecond'`))
        .returning({ id: leagueMatches.id })).length > 0,
    });
  }

  // jogos de torneio
  const hookMatches = db.select({ id: tournamentMatches.id }).from(tournamentMatches).innerJoin(tournaments, eq(tournaments.id, tournamentMatches.tournamentId))
    .where(inArray(tournaments.leagueId, hookLeagueIds));
  const games = await db.query.tournamentGames.findMany({
    where: and(isNull(tournamentGames.notifiedAt), inArray(tournamentGames.tournamentMatchId, hookMatches)),
    with: { match: { with: { tournament: true, teamA: { columns: { id: true, name: true } }, teamB: { columns: { id: true, name: true } }, games: { columns: { id: true, winnerTeamId: true, playedAt: true } } } } },
    orderBy: [asc(tournamentGames.playedAt), asc(tournamentGames.id)], limit: LOAD_LIMIT,
  });
  const tIds = [...new Set(games.map((g) => g.match.tournamentId))];
  const lastRound = new Map<number, number>();
  if (tIds.length) {
    const rows = await db.select({ t: tournamentMatches.tournamentId, r: sql<number>`max(${tournamentMatches.round})::int` }).from(tournamentMatches)
      .where(and(inArray(tournamentMatches.tournamentId, tIds), eq(tournamentMatches.stage, 'bracket'))).groupBy(tournamentMatches.tournamentId);
    for (const r of rows) lastRound.set(r.t, r.r);
  }
  for (const g of games) {
    const m = g.match;
    const t = m.tournament;
    if (t.leagueId == null) continue;
    const upTo = [...m.games].sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime() || a.id - b.id);
    const played = upTo.slice(0, upTo.findIndex((x) => x.id === g.id) + 1);
    const scoreA = played.filter((x) => x.winnerTeamId === m.teamAId).length;
    const scoreB = played.filter((x) => x.winnerTeamId === m.teamBId).length;
    const need = Math.floor(m.bestOf / 2) + 1;
    const winnerId = scoreA >= need ? m.teamAId : scoreB >= need ? m.teamBId : null;
    const winner = winnerId === m.teamAId ? m.teamA?.name : m.teamB?.name;
    const last = lastRound.get(t.id) ?? m.round;
    const round = m.stage === 'group' ? `Grupo ${m.groupNo ?? '?'} · Rodada ${m.round}`
      : last - m.round === 0 ? 'Final' : last - m.round === 1 ? 'Semifinal' : last - m.round === 2 ? 'Quartas de final' : last - m.round === 3 ? 'Oitavas de final' : `Rodada ${m.round}`;
    const closed = winnerId && winner ? { winner, outcome: m.stage === 'group' ? 'group' as const : m.nextMatchId == null ? 'champion' as const : 'advances' as const } : null;
    const leagueId = t.leagueId;
    items.push({
      leagueId, event: 'tournament', at: g.playedAt, divisionId: null,
      build: () => tournamentEmbed({ tournament: t.name, round, teamA: m.teamA?.name ?? '?', teamB: m.teamB?.name ?? '?', scoreA, scoreB, bestOf: m.bestOf, closed }, lname(leagueId), g.playedAt, appUrl(`/tournaments/${t.slug}`)),
      mark: async () => (await db.update(tournamentGames).set({ notifiedAt: sql`now()` }).where(and(eq(tournamentGames.id, g.id), isNull(tournamentGames.notifiedAt))).returning({ id: tournamentGames.id })).length > 0,
    });
  }

  // novos membros
  const members = await db.query.leagueMembers.findMany({
    where: and(isNull(leagueMembers.notifiedAt), isNull(leagueMembers.leftAt), inArray(leagueMembers.leagueId, hookLeagueIds)),
    with: { player: { columns: { alias: true } }, division: true, season: { columns: { startedAt: true, number: true } } },
    orderBy: [asc(leagueMembers.joinedAt)], limit: LOAD_LIMIT,
  });
  for (const mb of members) {
    const rollover = mb.season.number > 1 && mb.joinedAt.getTime() === mb.season.startedAt.getTime();
    items.push({
      leagueId: mb.leagueId, event: 'member', at: mb.joinedAt, divisionId: mb.divisionId,
      build: rollover ? null : () => memberEmbed({ player: mb.player.alias, division: discordDivisionName(mb.division), rating: mb.placementRating }, lname(mb.leagueId), mb.joinedAt, lurl(mb.leagueId)),
      mark: async () => (await db.update(leagueMembers).set({ notifiedAt: sql`now()` }).where(and(eq(leagueMembers.id, mb.id), isNull(leagueMembers.notifiedAt))).returning({ id: leagueMembers.id })).length > 0,
    });
  }

  // fim de temporada: pódio de cada divisão, filtrado pelas divisões de cada webhook
  const ended = await db.query.seasons.findMany({
    where: and(isNotNull(seasons.endedAt), isNull(seasons.notifiedAt), inArray(seasons.leagueId, hookLeagueIds)),
    orderBy: [asc(seasons.endedAt)], limit: LOAD_LIMIT,
  });
  for (const s of ended) {
    const divs = await db.query.divisions.findMany({ where: eq(divisions.leagueId, s.leagueId), orderBy: [asc(divisions.sort)] });
    const perDiv: SeasonDivision[] = [];
    for (const d of divs) {
      const rows = (await standings(s.id, d.id)).filter((r) => r.wins + r.losses > 0).slice(0, 3);
      perDiv.push({ divisionId: d.id, division: discordDivisionName(d), podium: rows.map((r) => ({ player: r.alias, points: r.points })) });
    }
    const at = s.endedAt!;
    items.push({
      leagueId: s.leagueId, event: 'season', at, divisionId: null,
      build: (hook) => seasonEmbed({ number: s.number, divisions: perDiv.filter((d) => hook.divisionIds == null || hook.divisionIds.includes(d.divisionId)) }, lname(s.leagueId), at, lurl(s.leagueId)),
      mark: async () => (await db.update(seasons).set({ notifiedAt: sql`now()` }).where(and(eq(seasons.id, s.id), isNull(seasons.notifiedAt))).returning({ id: seasons.id })).length > 0,
    });
  }
  return items;
}

/**
 * Um ciclo de avisos. Idempotente: pode rodar a cada ciclo do worker (e em mais de um worker).
 * Devolve quantos embeds o Discord aceitou.
 */
export async function processNotifications(): Promise<number> {
  const hooks = await db.select().from(leagueWebhooks).where(eq(leagueWebhooks.enabled, true)).orderBy(asc(leagueWebhooks.id));
  const hookLeagueIds = [...new Set(hooks.map((h) => h.leagueId))];
  await markWithoutHooks(hookLeagueIds);
  if (hookLeagueIds.length === 0) return 0;

  const items = await loadItems(hookLeagueIds);
  const byLeague = new Map<number, Item[]>();
  for (const it of items) (byLeague.get(it.leagueId) ?? byLeague.set(it.leagueId, []).get(it.leagueId)!).push(it);

  const batches = new Map<number, { hook: LeagueWebhook; embeds: DiscordEmbed[] }>();
  for (const [leagueId, list] of byLeague) {
    const leagueHooks = hooks.filter((h) => h.leagueId === leagueId);
    list.sort((a, b) => a.at.getTime() - b.at.getTime());
    let blocked = false; // um aviso não coube: os seguintes que iriam pro Discord esperam, pra manter a ordem
    for (const it of list) {
      const targets = leagueHooks.filter((h) => wants(h, it));
      if (targets.length === 0) { await it.mark(); continue; } // ninguém quer: só marca
      if (blocked || targets.some((h) => (batches.get(h.id)?.embeds.length ?? 0) >= MAX_EMBEDS_PER_CYCLE)) { blocked = true; continue; }
      if (!(await it.mark())) continue; // outro worker pegou, ou a linha mudou: fica pro próximo ciclo
      for (const h of targets) {
        const b = batches.get(h.id) ?? batches.set(h.id, { hook: h, embeds: [] }).get(h.id)!;
        b.embeds.push(it.build!(h));
      }
    }
  }

  let sent = 0;
  for (const { hook, embeds } of batches.values()) {
    if (embeds.length === 0) continue;
    const r = await sendTo(hook, embeds);
    if (r.ok) sent += embeds.length;
  }
  return sent;
}
