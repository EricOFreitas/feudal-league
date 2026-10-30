CREATE TABLE "incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"severity" varchar(8) DEFAULT 'minor' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "league_webhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"url" text NOT NULL,
	"events" jsonb DEFAULT '["match","voided","tournament","season"]'::jsonb NOT NULL,
	"division_ids" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_badges" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"badge" varchar(16) NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"note" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standing_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"division_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"position" integer NOT NULL,
	"total" integer NOT NULL,
	"points" integer NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" varchar(24) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"players" integer DEFAULT 0 NOT NULL,
	"matches" integer DEFAULT 0 NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "league_matches" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "league_matches" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "league_members" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tournament_games" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "league_webhooks" ADD CONSTRAINT "league_webhooks_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_badges" ADD CONSTRAINT "player_badges_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_snapshots" ADD CONSTRAINT "standing_snapshots_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_snapshots" ADD CONSTRAINT "standing_snapshots_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_snapshots" ADD CONSTRAINT "standing_snapshots_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incidents_time_idx" ON "incidents" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "league_webhooks_league_idx" ON "league_webhooks" USING btree ("league_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_badges_player_badge_idx" ON "player_badges" USING btree ("player_id","badge");--> statement-breakpoint
CREATE INDEX "standing_snapshots_player_idx" ON "standing_snapshots" USING btree ("player_id","season_id","captured_at");--> statement-breakpoint
CREATE INDEX "standing_snapshots_season_idx" ON "standing_snapshots" USING btree ("season_id","captured_at");--> statement-breakpoint
CREATE INDEX "sync_runs_kind_time_idx" ON "sync_runs" USING btree ("kind","finished_at");