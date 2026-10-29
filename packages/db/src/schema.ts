import { relations } from 'drizzle-orm';
import {
  bigint, boolean, index, integer, pgTable, primaryKey, serial, smallint, text, timestamp, uniqueIndex, varchar,
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
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    /** null = ativo. Preenchido quando sai ou é removido. */
    leftAt: timestamp('left_at', { withTimezone: true }),
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
  },
  (t) => [
    uniqueIndex('league_matches_season_match_idx').on(t.seasonId, t.matchId),
    index('league_matches_division_idx').on(t.divisionId, t.playedAt),
  ],
);

export const playersRelations = relations(players, ({ many, one }) => ({
  ratings: many(playerRatings),
  memberships: many(leagueMembers),
  claimedBy: one(users, { fields: [players.claimedByUserId], references: [users.id] }),
}));
export const playerRatingsRelations = relations(playerRatings, ({ one }) => ({
  player: one(players, { fields: [playerRatings.playerId], references: [players.id] }),
}));
export const matchesRelations = relations(matches, ({ many }) => ({ members: many(matchMembers) }));
export const matchMembersRelations = relations(matchMembers, ({ one }) => ({
  match: one(matches, { fields: [matchMembers.matchId], references: [matches.id] }),
}));

export const leaguesRelations = relations(leagues, ({ many, one }) => ({
  owner: one(users, { fields: [leagues.ownerUserId], references: [users.id] }),
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

