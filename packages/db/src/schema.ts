import { relations } from 'drizzle-orm';
import {
  bigint, boolean, index, integer, jsonb, pgTable, primaryKey, serial, smallint, text, timestamp, uniqueIndex, varchar,
} from 'drizzle-orm/pg-core';

/** Conta no portal. Nasce no login Steam. */
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  steamId64: varchar('steam_id64', { length: 17 }).notNull().unique(),
  locale: varchar('locale', { length: 5 }).notNull().default('pt'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

/** Jogador do AoE2. Independe de conta: qualquer visitante cria; o dono reivindica depois. */
export const players = pgTable(
  'players',
  {
    id: serial('id').primaryKey(),
    profileId: integer('profile_id').notNull().unique(),
    steamId64: varchar('steam_id64', { length: 17 }),
    alias: text('alias').notNull(),
    country: varchar('country', { length: 2 }),
    clan: text('clan'),
    claimedByUserId: integer('claimed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    addedByIpHash: varchar('added_by_ip_hash', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastSyncError: text('last_sync_error'),
    /** Última tentativa de trazer este jogador pra uma liga automaticamente (evita repetir a cada ciclo). */
    autoJoinCheckedAt: timestamp('auto_join_checked_at', { withTimezone: true }),
  },
  (t) => [index('players_steam_idx').on(t.steamId64), index('players_claimed_idx').on(t.claimedByUserId)],
);

/** Estado atual por ladder. Uma linha por (jogador, ladder), sobrescrita a cada sync. */
export const playerRatings = pgTable(
  'player_ratings',
  {
    playerId: integer('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
    leaderboardId: smallint('leaderboard_id').notNull(),
    rating: integer('rating').notNull(),
    rank: integer('rank').notNull(),
    rankTotal: integer('rank_total').notNull(),
    wins: integer('wins').notNull(),
    losses: integer('losses').notNull(),
    streak: integer('streak').notNull(),
    drops: integer('drops').notNull(),
    highestRating: integer('highest_rating').notNull(),
    highestRank: integer('highest_rank').notNull(),
    lastMatchAt: timestamp('last_match_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.leaderboardId] })],
);

/** Histórico: só grava quando rating, wins ou losses mudaram. */
export const ratingSnapshots = pgTable(
  'rating_snapshots',
  {
    id: serial('id').primaryKey(),
    playerId: integer('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
    leaderboardId: smallint('leaderboard_id').notNull(),
    rating: integer('rating').notNull(),
    rank: integer('rank').notNull(),
    wins: integer('wins').notNull(),
    losses: integer('losses').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('snapshots_player_lb_idx').on(t.playerId, t.leaderboardId, t.capturedAt)],
);

/** Partida como a API devolve. id = id da API. */
export const matches = pgTable(
  'matches',
  {
    id: bigint('id', { mode: 'number' }).primaryKey(),
    matchtypeId: smallint('matchtype_id').notNull(),
    mapName: text('map_name').notNull(),
    description: text('description'),
    maxPlayers: smallint('max_players').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('matches_completed_idx').on(t.completedAt)],
);

/** Participante. Guarda profile_id direto: nem todo participante tem registro em players. */
export const matchMembers = pgTable(
  'match_members',
  {
    matchId: bigint('match_id', { mode: 'number' }).notNull().references(() => matches.id, { onDelete: 'cascade' }),
    profileId: integer('profile_id').notNull(),
    alias: text('alias'),
    team: smallint('team').notNull(),
    civId: smallint('civ_id').notNull(),
    outcome: smallint('outcome').notNull(),
    oldRating: integer('old_rating').notNull(),
    newRating: integer('new_rating').notNull(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.profileId] }), index('match_members_profile_idx').on(t.profileId, t.matchId)],
);

/** Limite por IP ao adicionar jogador. */
export const playerAdditions = pgTable(
  'player_additions',
  {
    id: serial('id').primaryKey(),
    ipHash: varchar('ip_hash', { length: 64 }).notNull(),
    profileId: integer('profile_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('additions_ip_time_idx').on(t.ipHash, t.createdAt)],
);

/* ───────────────────────────── Ligas (fase 1) ───────────────────────────── */

/**
 * Liga: comunidade que agrupa jogadores em divisões por faixa de rating.
 * A liga global (is_global) pertence ao sistema (owner null) e nasce na migration.
 */
export const leagues = pgTable(
  'leagues',
  {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 48 }).notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    ownerUserId: integer('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    isGlobal: boolean('is_global').notNull().default(false),
    /** open = aceita inscrição; closed = não aceita; archived = some da lista. */
    status: varchar('status', { length: 12 }).notNull().default('open'),
    /** Partida ranqueada entre membros conta? Senão, só lobby. */
    countRanked: boolean('count_ranked').notNull().default(true),
    /** Mínimo de partidas na RM 1v1 pra ter faixa confiável. */
    minGames: smallint('min_games').notNull().default(10),
    /** Pontos por vitória e por derrota em partida que conta. Global: 3/0. Padrão das ligas próprias: 3/1. */
    pointsWin: smallint('points_win').notNull().default(3),
    pointsLoss: smallint('points_loss').notNull().default(1),
    /** Ranqueada 1v1 de um membro contra NÃO-membro com rating na faixa da divisão também conta (só ranqueada). */
    countNonMembers: boolean('count_non_members').notNull().default(false),
    /** Adversário de partida que contou é trazido pra liga automaticamente (colocado pelo pico, se elegível). */
    autoJoinOpponents: boolean('auto_join_opponents').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('leagues_owner_idx').on(t.ownerUserId)],
);

/** Temporada: a faixa do membro congela na inscrição e é revista quando a temporada fecha. */
export const seasons = pgTable(
  'seasons',
  {
    id: serial('id').primaryKey(),
    leagueId: integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
    number: smallint('number').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    /** Aviso de fim de temporada já enviado (Discord). */
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('seasons_league_number_idx').on(t.leagueId, t.number)],
);

/** Divisão: faixa de rating dentro da liga. name_key = nome padrão traduzido; name = nome livre do dono. */
export const divisions = pgTable(
  'divisions',
  {
    id: serial('id').primaryKey(),
    leagueId: integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
    sort: smallint('sort').notNull(),
    nameKey: varchar('name_key', { length: 16 }),
    name: text('name'),
    ratingMin: integer('rating_min').notNull(),
    /** null = sem teto. */
    ratingMax: integer('rating_max'),
  },
  (t) => [index('divisions_league_idx').on(t.leagueId, t.sort)],
);

/** Inscrição de um jogador numa temporada. Uma por (temporada, jogador). */
export const leagueMembers = pgTable(
  'league_members',
  {
    id: serial('id').primaryKey(),
    leagueId: integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
    seasonId: integer('season_id').notNull().references(() => seasons.id, { onDelete: 'cascade' }),
    divisionId: integer('division_id').notNull().references(() => divisions.id, { onDelete: 'cascade' }),
    playerId: integer('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
    /** Rating máximo RM 1v1 usado pra escolher a divisão. */
    placementRating: integer('placement_rating').notNull(),
    /** join = clicou em Entrar; claim = entrou ao reivindicar o perfil; auto = trazido como adversário. */
    source: varchar('source', { length: 8 }).notNull().default('join'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    /** null = ativo. Preenchido quando sai ou é removido. */
    leftAt: timestamp('left_at', { withTimezone: true }),
    /** Aviso de "novo membro" já enviado (Discord). */
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('league_members_season_player_idx').on(t.seasonId, t.playerId),
    index('league_members_player_idx').on(t.playerId),
    index('league_members_division_idx').on(t.divisionId),
  ],
);

/** Partida detectada no histórico entre dois membros da mesma divisão. */
export const leagueMatches = pgTable(
  'league_matches',
  {
    id: serial('id').primaryKey(),
    leagueId: integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
    seasonId: integer('season_id').notNull().references(() => seasons.id, { onDelete: 'cascade' }),
    divisionId: integer('division_id').notNull().references(() => divisions.id, { onDelete: 'cascade' }),
    matchId: bigint('match_id', { mode: 'number' }).notNull().references(() => matches.id, { onDelete: 'cascade' }),
    winnerPlayerId: integer('winner_player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
    loserPlayerId: integer('loser_player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
    playedAt: timestamp('played_at', { withTimezone: true }).notNull(),
    /** counted = vale; voided = anulada pelo dono. */
    status: varchar('status', { length: 12 }).notNull().default('counted'),
    voidReason: text('void_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Aviso da partida já enviado (Discord). Anulação/restauração compara com updated_at. */
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('league_matches_season_match_idx').on(t.seasonId, t.matchId),
    index('league_matches_division_idx').on(t.divisionId, t.playedAt),
  ],
);

/* ───────────────────────── Análise de partida (fase 2) ───────────────────────── */

/**
 * Pedido de análise de uma partida sob a ótica de um jogador. O worker baixa o replay
 * oficial (serviço analyzer), resume e pede o feedback ao modelo de linguagem.
 * Uma por (partida, jogador). Leitura é pública; pedir exige dono do perfil.
 */
export const matchAnalyses = pgTable(
  'match_analyses',
  {
    id: serial('id').primaryKey(),
    matchId: bigint('match_id', { mode: 'number' }).notNull().references(() => matches.id, { onDelete: 'cascade' }),
    /** Jogador analisado (participante da partida). */
    profileId: integer('profile_id').notNull(),
    requestedByUserId: integer('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Idioma do feedback. */
    locale: varchar('locale', { length: 5 }).notNull().default('pt'),
    /** queued → parsing → writing → done | failed. */
    status: varchar('status', { length: 12 }).notNull().default('queued'),
    error: text('error'),
    /** Resumo devolvido pelo analyzer (JSON). */
    parse: jsonb('parse'),
    model: text('model'),
    feedback: text('feedback'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    /** Custo informado pelo OpenRouter, em microdólares (1e-6 USD). */
    costMicroUsd: integer('cost_micro_usd'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('match_analyses_match_profile_idx').on(t.matchId, t.profileId),
    index('match_analyses_user_time_idx').on(t.requestedByUserId, t.createdAt),
    index('match_analyses_status_idx').on(t.status, t.createdAt),
  ],
);

export const playersRelations = relations(players, ({ many, one }) => ({
  ratings: many(playerRatings),
  memberships: many(leagueMembers),
  badges: many(playerBadges),
  claimedBy: one(users, { fields: [players.claimedByUserId], references: [users.id] }),
}));
export const playerRatingsRelations = relations(playerRatings, ({ one }) => ({
  player: one(players, { fields: [playerRatings.playerId], references: [players.id] }),
}));
export const matchesRelations = relations(matches, ({ many }) => ({ members: many(matchMembers), analyses: many(matchAnalyses) }));
export const matchAnalysesRelations = relations(matchAnalyses, ({ one }) => ({
  match: one(matches, { fields: [matchAnalyses.matchId], references: [matches.id] }),
}));
export const matchMembersRelations = relations(matchMembers, ({ one }) => ({
  match: one(matches, { fields: [matchMembers.matchId], references: [matches.id] }),
}));

export const leaguesRelations = relations(leagues, ({ many, one }) => ({
  owner: one(users, { fields: [leagues.ownerUserId], references: [users.id] }),
  webhooks: many(leagueWebhooks),
  seasons: many(seasons),
  divisions: many(divisions),
  members: many(leagueMembers),
}));
export const seasonsRelations = relations(seasons, ({ one, many }) => ({
  league: one(leagues, { fields: [seasons.leagueId], references: [leagues.id] }),
  members: many(leagueMembers),
}));
export const divisionsRelations = relations(divisions, ({ one, many }) => ({
  league: one(leagues, { fields: [divisions.leagueId], references: [leagues.id] }),
  members: many(leagueMembers),
}));
export const leagueMembersRelations = relations(leagueMembers, ({ one }) => ({
  league: one(leagues, { fields: [leagueMembers.leagueId], references: [leagues.id] }),
  season: one(seasons, { fields: [leagueMembers.seasonId], references: [seasons.id] }),
  division: one(divisions, { fields: [leagueMembers.divisionId], references: [divisions.id] }),
  player: one(players, { fields: [leagueMembers.playerId], references: [players.id] }),
}));
export const leagueMatchesRelations = relations(leagueMatches, ({ one }) => ({
  league: one(leagues, { fields: [leagueMatches.leagueId], references: [leagues.id] }),
  division: one(divisions, { fields: [leagueMatches.divisionId], references: [divisions.id] }),
  match: one(matches, { fields: [leagueMatches.matchId], references: [matches.id] }),
  winner: one(players, { fields: [leagueMatches.winnerPlayerId], references: [players.id], relationName: 'winner' }),
  loser: one(players, { fields: [leagueMatches.loserPlayerId], references: [players.id], relationName: 'loser' }),
}));

/* ───────────────────────────── Torneios (fase 3) ───────────────────────────── */

/**
 * Torneio entre times de team_size jogadores (1 a 4; 2v2 por padrão).
 * format: single_elim (só mata-mata) ou groups_elim (grupos em pontos corridos, depois mata-mata
 * com os advance_per_group melhores de cada grupo).
 * Resultado confirmado pelo histórico (partida com exatamente os jogadores dos dois times,
 * nos times certos, depois do início) ou reportado pelo organizador.
 * status: open (inscrições) → groups (fase de grupos) → running (chave) → finished | cancelled.
 */
export const tournaments = pgTable(
  'tournaments',
  {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 48 }).notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    ownerUserId: integer('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    leagueId: integer('league_id').references(() => leagues.id, { onDelete: 'set null' }),
    teamSize: smallint('team_size').notNull().default(2),
    format: varchar('format', { length: 16 }).notNull().default('single_elim'),
    /** Melhor de N por confronto da chave; a final pode ter outro valor. */
    bestOf: smallint('best_of').notNull().default(1),
    finalBestOf: smallint('final_best_of'),
    /** Fase de grupos: quantos grupos (0 = sem grupos), quantos avançam por grupo, melhor de N nos grupos. */
    groupCount: smallint('group_count').notNull().default(0),
    advancePerGroup: smallint('advance_per_group').notNull().default(2),
    groupBestOf: smallint('group_best_of').notNull().default(1),
    maxTeams: smallint('max_teams'),
    /**
     * Requisitos de inscrição (anti-smurf), checados por jogador na ladder RM 1v1:
     * pico de rating ≤ max_peak_rating; partidas totais ≥ min_games; partidas nos últimos 30 dias
     * registradas no portal ≥ min_recent_games. null = sem exigência. O organizador pode ignorar.
     */
    maxPeakRating: integer('max_peak_rating'),
    minGames: smallint('min_games'),
    minRecentGames: smallint('min_recent_games'),
    /** Premiação em texto livre (ex.: "R$ 2.000: 70% campeão, 30% vice"). */
    prize: text('prize'),
    status: varchar('status', { length: 12 }).notNull().default('open'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    /** Quando a chave foi gerada. Só partidas depois disso contam. */
    bracketAt: timestamp('bracket_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tournaments_owner_idx').on(t.ownerUserId), index('tournaments_status_idx').on(t.status)],
);

/** Time inscrito. pending = inscrito pela dupla, aguardando o organizador; confirmed = entra na chave. */
export const tournamentTeams = pgTable(
  'tournament_teams',
  {
    id: serial('id').primaryKey(),
    tournamentId: integer('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    seed: smallint('seed'),
    /** Grupo sorteado na fase de grupos (1..group_count). */
    groupNo: smallint('group_no'),
    status: varchar('status', { length: 12 }).notNull().default('pending'),
    createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tournament_teams_tournament_idx').on(t.tournamentId)],
);

/** Jogador de um time. Um jogador só pode estar em um time por torneio. */
export const tournamentTeamMembers = pgTable(
  'tournament_team_members',
  {
    teamId: integer('team_id').notNull().references(() => tournamentTeams.id, { onDelete: 'cascade' }),
    tournamentId: integer('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
    playerId: integer('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
    isCaptain: boolean('is_captain').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.playerId] }), uniqueIndex('tournament_team_members_player_idx').on(t.tournamentId, t.playerId)],
);

/**
 * Confronto. stage = group (pontos corridos dentro de group_no) ou bracket (chave).
 * round 1 = primeira rodada; position = índice na rodada.
 * next_match_id/next_slot = pra onde o vencedor vai (só na chave). Time null = ainda indefinido (ou bye).
 * status: pending (falta time) → ready (dois times) → done. walkover = vencedor sem jogo (bye/W.O.).
 */
export const tournamentMatches = pgTable(
  'tournament_matches',
  {
    id: serial('id').primaryKey(),
    tournamentId: integer('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
    stage: varchar('stage', { length: 8 }).notNull().default('bracket'),
    groupNo: smallint('group_no'),
    round: smallint('round').notNull(),
    position: smallint('position').notNull(),
    teamAId: integer('team_a_id').references(() => tournamentTeams.id, { onDelete: 'set null' }),
    teamBId: integer('team_b_id').references(() => tournamentTeams.id, { onDelete: 'set null' }),
    winnerTeamId: integer('winner_team_id').references(() => tournamentTeams.id, { onDelete: 'set null' }),
    bestOf: smallint('best_of').notNull().default(1),
    scoreA: smallint('score_a').notNull().default(0),
    scoreB: smallint('score_b').notNull().default(0),
    status: varchar('status', { length: 12 }).notNull().default('pending'),
    nextMatchId: integer('next_match_id'),
    nextSlot: varchar('next_slot', { length: 1 }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    note: text('note'),
  },
  (t) => [uniqueIndex('tournament_matches_round_pos_idx').on(t.tournamentId, t.stage, t.round, t.position), index('tournament_matches_status_idx').on(t.status)],
);

/** Jogo de um confronto: detectado no histórico (match_id) ou reportado à mão (match_id null). */
export const tournamentGames = pgTable(
  'tournament_games',
  {
    id: serial('id').primaryKey(),
    tournamentMatchId: integer('tournament_match_id').notNull().references(() => tournamentMatches.id, { onDelete: 'cascade' }),
    matchId: bigint('match_id', { mode: 'number' }).references(() => matches.id, { onDelete: 'set null' }),
    winnerTeamId: integer('winner_team_id').notNull().references(() => tournamentTeams.id, { onDelete: 'cascade' }),
    source: varchar('source', { length: 8 }).notNull().default('auto'),
    reportedByUserId: integer('reported_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    playedAt: timestamp('played_at', { withTimezone: true }).notNull().defaultNow(),
    /** Aviso do jogo já enviado (Discord). */
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
  },
  (t) => [index('tournament_games_match_idx').on(t.tournamentMatchId), uniqueIndex('tournament_games_source_match_idx').on(t.tournamentMatchId, t.matchId)],
);

export const tournamentsRelations = relations(tournaments, ({ one, many }) => ({
  owner: one(users, { fields: [tournaments.ownerUserId], references: [users.id] }),
  league: one(leagues, { fields: [tournaments.leagueId], references: [leagues.id] }),
  teams: many(tournamentTeams),
  matches: many(tournamentMatches),
}));
export const tournamentTeamsRelations = relations(tournamentTeams, ({ one, many }) => ({
  tournament: one(tournaments, { fields: [tournamentTeams.tournamentId], references: [tournaments.id] }),
  members: many(tournamentTeamMembers),
}));
export const tournamentTeamMembersRelations = relations(tournamentTeamMembers, ({ one }) => ({
  team: one(tournamentTeams, { fields: [tournamentTeamMembers.teamId], references: [tournamentTeams.id] }),
  player: one(players, { fields: [tournamentTeamMembers.playerId], references: [players.id] }),
}));
export const tournamentMatchesRelations = relations(tournamentMatches, ({ one, many }) => ({
  tournament: one(tournaments, { fields: [tournamentMatches.tournamentId], references: [tournaments.id] }),
  teamA: one(tournamentTeams, { fields: [tournamentMatches.teamAId], references: [tournamentTeams.id], relationName: 'teamA' }),
  teamB: one(tournamentTeams, { fields: [tournamentMatches.teamBId], references: [tournamentTeams.id], relationName: 'teamB' }),
  winner: one(tournamentTeams, { fields: [tournamentMatches.winnerTeamId], references: [tournamentTeams.id], relationName: 'winner' }),
  games: many(tournamentGames),
}));
export const tournamentGamesRelations = relations(tournamentGames, ({ one }) => ({
  match: one(tournamentMatches, { fields: [tournamentGames.tournamentMatchId], references: [tournamentMatches.id] }),
  game: one(matches, { fields: [tournamentGames.matchId], references: [matches.id] }),
  winner: one(tournamentTeams, { fields: [tournamentGames.winnerTeamId], references: [tournamentTeams.id] }),
}));

/* ─────────────────── Comunidade, avisos, histórico e status (fase 4) ─────────────────── */

/**
 * Badge de um jogador: supporter (doou), code (PR aceito), translator, organizer.
 * Concedido à mão (script no worker) ou computado; visible = o jogador quer mostrar.
 */
export const playerBadges = pgTable(
  'player_badges',
  {
    id: serial('id').primaryKey(),
    playerId: integer('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
    badge: varchar('badge', { length: 16 }).notNull(),
    visible: boolean('visible').notNull().default(true),
    note: text('note'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('player_badges_player_badge_idx').on(t.playerId, t.badge)],
);

/**
 * Webhook do Discord de uma liga. events = lista de chaves ('match','voided','tournament','member','season');
 * divisionIds = null (todas) ou lista de ids. A URL nunca sai do servidor.
 */
export const leagueWebhooks = pgTable(
  'league_webhooks',
  {
    id: serial('id').primaryKey(),
    leagueId: integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    events: jsonb('events').$type<string[]>().notNull().default(['match', 'voided', 'tournament', 'season']),
    divisionIds: jsonb('division_ids').$type<number[] | null>(),
    enabled: boolean('enabled').notNull().default(true),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('league_webhooks_league_idx').on(t.leagueId)],
);

/** Posição de cada membro na divisão, tirada toda semana pelo worker (gráfico de evolução). */
export const standingSnapshots = pgTable(
  'standing_snapshots',
  {
    id: serial('id').primaryKey(),
    seasonId: integer('season_id').notNull().references(() => seasons.id, { onDelete: 'cascade' }),
    divisionId: integer('division_id').notNull().references(() => divisions.id, { onDelete: 'cascade' }),
    playerId: integer('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    total: integer('total').notNull(),
    points: integer('points').notNull(),
    wins: integer('wins').notNull(),
    losses: integer('losses').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('standing_snapshots_player_idx').on(t.playerId, t.seasonId, t.capturedAt), index('standing_snapshots_season_idx').on(t.seasonId, t.capturedAt)],
);

/** Execução do worker (página de status). kind: league | claimed | viewed | tournament | analysis | detect. */
export const syncRuns = pgTable(
  'sync_runs',
  {
    id: serial('id').primaryKey(),
    kind: varchar('kind', { length: 24 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }).notNull(),
    players: integer('players').notNull().default(0),
    matches: integer('matches').notNull().default(0),
    ok: boolean('ok').notNull().default(true),
    error: text('error'),
  },
  (t) => [index('sync_runs_kind_time_idx').on(t.kind, t.finishedAt)],
);

/** Incidente registrado à mão ou pelo worker (API do jogo fora, atraso). */
export const incidents = pgTable(
  'incidents',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    body: text('body'),
    severity: varchar('severity', { length: 8 }).notNull().default('minor'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [index('incidents_time_idx').on(t.startedAt)],
);

export const playerBadgesRelations = relations(playerBadges, ({ one }) => ({
  player: one(players, { fields: [playerBadges.playerId], references: [players.id] }),
}));
export const leagueWebhooksRelations = relations(leagueWebhooks, ({ one }) => ({
  league: one(leagues, { fields: [leagueWebhooks.leagueId], references: [leagues.id] }),
}));
export const standingSnapshotsRelations = relations(standingSnapshots, ({ one }) => ({
  player: one(players, { fields: [standingSnapshots.playerId], references: [players.id] }),
  season: one(seasons, { fields: [standingSnapshots.seasonId], references: [seasons.id] }),
  division: one(divisions, { fields: [standingSnapshots.divisionId], references: [divisions.id] }),
}));

export type User = typeof users.$inferSelect;
export type Player = typeof players.$inferSelect;
export type PlayerRating = typeof playerRatings.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type MatchMember = typeof matchMembers.$inferSelect;
export type League = typeof leagues.$inferSelect;
export type Season = typeof seasons.$inferSelect;
export type Division = typeof divisions.$inferSelect;
export type LeagueMember = typeof leagueMembers.$inferSelect;
export type LeagueMatch = typeof leagueMatches.$inferSelect;
export type MatchAnalysis = typeof matchAnalyses.$inferSelect;
export type Tournament = typeof tournaments.$inferSelect;
export type TournamentTeam = typeof tournamentTeams.$inferSelect;
export type TournamentTeamMember = typeof tournamentTeamMembers.$inferSelect;
export type TournamentMatch = typeof tournamentMatches.$inferSelect;
export type TournamentGame = typeof tournamentGames.$inferSelect;
export type PlayerBadge = typeof playerBadges.$inferSelect;
export type LeagueWebhook = typeof leagueWebhooks.$inferSelect;
export type StandingSnapshot = typeof standingSnapshots.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;
export type Incident = typeof incidents.$inferSelect;
