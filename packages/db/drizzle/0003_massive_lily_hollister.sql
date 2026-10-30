CREATE TABLE "tournament_games" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_match_id" integer NOT NULL,
	"match_id" bigint,
	"winner_team_id" integer NOT NULL,
	"source" varchar(8) DEFAULT 'auto' NOT NULL,
	"reported_by_user_id" integer,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"round" smallint NOT NULL,
	"position" smallint NOT NULL,
	"team_a_id" integer,
	"team_b_id" integer,
	"winner_team_id" integer,
	"best_of" smallint DEFAULT 1 NOT NULL,
	"score_a" smallint DEFAULT 0 NOT NULL,
	"score_b" smallint DEFAULT 0 NOT NULL,
	"status" varchar(12) DEFAULT 'pending' NOT NULL,
	"next_match_id" integer,
	"next_slot" varchar(1),
	"scheduled_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "tournament_team_members" (
	"team_id" integer NOT NULL,
	"tournament_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"is_captain" boolean DEFAULT false NOT NULL,
	CONSTRAINT "tournament_team_members_team_id_player_id_pk" PRIMARY KEY("team_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "tournament_teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"name" text NOT NULL,
	"seed" smallint,
	"status" varchar(12) DEFAULT 'pending' NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(48) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_user_id" integer,
	"league_id" integer,
	"team_size" smallint DEFAULT 2 NOT NULL,
	"format" varchar(16) DEFAULT 'single_elim' NOT NULL,
	"best_of" smallint DEFAULT 1 NOT NULL,
	"final_best_of" smallint,
	"max_teams" smallint,
	"status" varchar(12) DEFAULT 'open' NOT NULL,
	"starts_at" timestamp with time zone,
	"bracket_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournaments_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "tournament_games" ADD CONSTRAINT "tournament_games_tournament_match_id_tournament_matches_id_fk" FOREIGN KEY ("tournament_match_id") REFERENCES "public"."tournament_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_games" ADD CONSTRAINT "tournament_games_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_games" ADD CONSTRAINT "tournament_games_winner_team_id_tournament_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_games" ADD CONSTRAINT "tournament_games_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_team_a_id_tournament_teams_id_fk" FOREIGN KEY ("team_a_id") REFERENCES "public"."tournament_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_team_b_id_tournament_teams_id_fk" FOREIGN KEY ("team_b_id") REFERENCES "public"."tournament_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_winner_team_id_tournament_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_team_members" ADD CONSTRAINT "tournament_team_members_team_id_tournament_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_team_members" ADD CONSTRAINT "tournament_team_members_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_team_members" ADD CONSTRAINT "tournament_team_members_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tournament_games_match_idx" ON "tournament_games" USING btree ("tournament_match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_games_source_match_idx" ON "tournament_games" USING btree ("tournament_match_id","match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_matches_round_pos_idx" ON "tournament_matches" USING btree ("tournament_id","round","position");--> statement-breakpoint
CREATE INDEX "tournament_matches_status_idx" ON "tournament_matches" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_team_members_player_idx" ON "tournament_team_members" USING btree ("tournament_id","player_id");--> statement-breakpoint
CREATE INDEX "tournament_teams_tournament_idx" ON "tournament_teams" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tournaments_owner_idx" ON "tournaments" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "tournaments_status_idx" ON "tournaments" USING btree ("status");