import { relations } from 'drizzle-orm';
import {
  bigint, index, integer, pgTable, primaryKey, serial, smallint, text, timestamp, uniqueIndex, varchar,
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

export const playersRelations = relations(players, ({ many, one }) => ({
  ratings: many(playerRatings),
  claimedBy: one(users, { fields: [players.claimedByUserId], references: [users.id] }),
}));
export const playerRatingsRelations = relations(playerRatings, ({ one }) => ({
  player: one(players, { fields: [playerRatings.playerId], references: [players.id] }),
}));
export const matchesRelations = relations(matches, ({ many }) => ({ members: many(matchMembers) }));
export const matchMembersRelations = relations(matchMembers, ({ one }) => ({
  match: one(matches, { fields: [matchMembers.matchId], references: [matches.id] }),
}));

export type User = typeof users.$inferSelect;
export type Player = typeof players.$inferSelect;
export type PlayerRating = typeof playerRatings.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type MatchMember = typeof matchMembers.$inferSelect;

