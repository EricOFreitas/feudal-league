CREATE TABLE "divisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"sort" smallint NOT NULL,
	"name_key" varchar(16),
	"name" text,
	"rating_min" integer NOT NULL,
	"rating_max" integer
);
--> statement-breakpoint
CREATE TABLE "league_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"season_id" integer NOT NULL,
	"division_id" integer NOT NULL,
	"match_id" bigint NOT NULL,
	"winner_player_id" integer NOT NULL,
	"loser_player_id" integer NOT NULL,
	"played_at" timestamp with time zone NOT NULL,
	"status" varchar(12) DEFAULT 'counted' NOT NULL,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"season_id" integer NOT NULL,
	"division_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"placement_rating" integer NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(48) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_user_id" integer,
	"is_global" boolean DEFAULT false NOT NULL,
	"status" varchar(12) DEFAULT 'open' NOT NULL,
	"count_ranked" boolean DEFAULT true NOT NULL,
	"min_games" smallint DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leagues_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"number" smallint NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_matches" ADD CONSTRAINT "league_matches_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_matches" ADD CONSTRAINT "league_matches_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_matches" ADD CONSTRAINT "league_matches_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_matches" ADD CONSTRAINT "league_matches_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_matches" ADD CONSTRAINT "league_matches_winner_player_id_players_id_fk" FOREIGN KEY ("winner_player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_matches" ADD CONSTRAINT "league_matches_loser_player_id_players_id_fk" FOREIGN KEY ("loser_player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "divisions_league_idx" ON "divisions" USING btree ("league_id","sort");--> statement-breakpoint
CREATE UNIQUE INDEX "league_matches_season_match_idx" ON "league_matches" USING btree ("season_id","match_id");--> statement-breakpoint
CREATE INDEX "league_matches_division_idx" ON "league_matches" USING btree ("division_id","played_at");--> statement-breakpoint
CREATE UNIQUE INDEX "league_members_season_player_idx" ON "league_members" USING btree ("season_id","player_id");--> statement-breakpoint
CREATE INDEX "league_members_player_idx" ON "league_members" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "league_members_division_idx" ON "league_members" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX "leagues_owner_idx" ON "leagues" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_league_number_idx" ON "seasons" USING btree ("league_id","number");