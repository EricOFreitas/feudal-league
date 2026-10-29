CREATE TABLE "match_members" (
	"match_id" bigint NOT NULL,
	"profile_id" integer NOT NULL,
	"alias" text,
	"team" smallint NOT NULL,
	"civ_id" smallint NOT NULL,
	"outcome" smallint NOT NULL,
	"old_rating" integer NOT NULL,
	"new_rating" integer NOT NULL,
	CONSTRAINT "match_members_match_id_profile_id_pk" PRIMARY KEY("match_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" bigint PRIMARY KEY NOT NULL,
	"matchtype_id" smallint NOT NULL,
	"map_name" text NOT NULL,
	"description" text,
	"max_players" smallint NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_additions" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip_hash" varchar(64) NOT NULL,
	"profile_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_ratings" (
	"player_id" integer NOT NULL,
	"leaderboard_id" smallint NOT NULL,
	"rating" integer NOT NULL,
	"rank" integer NOT NULL,
	"rank_total" integer NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"streak" integer NOT NULL,
	"drops" integer NOT NULL,
	"highest_rating" integer NOT NULL,
	"highest_rank" integer NOT NULL,
	"last_match_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_ratings_player_id_leaderboard_id_pk" PRIMARY KEY("player_id","leaderboard_id")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"steam_id64" varchar(17),
	"alias" text NOT NULL,
	"country" varchar(2),
	"clan" text,
	"claimed_by_user_id" integer,
	"added_by_ip_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	CONSTRAINT "players_profile_id_unique" UNIQUE("profile_id")
);
--> statement-breakpoint
CREATE TABLE "rating_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"leaderboard_id" smallint NOT NULL,
	"rating" integer NOT NULL,
	"rank" integer NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"steam_id64" varchar(17) NOT NULL,
	"locale" varchar(5) DEFAULT 'pt' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_steam_id64_unique" UNIQUE("steam_id64")
);
--> statement-breakpoint
ALTER TABLE "match_members" ADD CONSTRAINT "match_members_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_ratings" ADD CONSTRAINT "player_ratings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_snapshots" ADD CONSTRAINT "rating_snapshots_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_members_profile_idx" ON "match_members" USING btree ("profile_id","match_id");--> statement-breakpoint
CREATE INDEX "matches_completed_idx" ON "matches" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "additions_ip_time_idx" ON "player_additions" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "players_steam_idx" ON "players" USING btree ("steam_id64");--> statement-breakpoint
CREATE INDEX "players_claimed_idx" ON "players" USING btree ("claimed_by_user_id");--> statement-breakpoint
CREATE INDEX "snapshots_player_lb_idx" ON "rating_snapshots" USING btree ("player_id","leaderboard_id","captured_at");