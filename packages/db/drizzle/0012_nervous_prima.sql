CREATE TABLE "open_lobbies" (
	"id" bigint PRIMARY KEY NOT NULL,
	"host_profile_id" integer NOT NULL,
	"description" text,
	"password_protected" boolean DEFAULT false NOT NULL,
	"players" smallint DEFAULT 1 NOT NULL,
	"max_players" smallint DEFAULT 2 NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sparring_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"league_id" integer NOT NULL,
	"division_id" integer NOT NULL,
	"kind" varchar(8) DEFAULT 'train' NOT NULL,
	"note" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sparring_availability" ADD CONSTRAINT "sparring_availability_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sparring_availability" ADD CONSTRAINT "sparring_availability_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sparring_availability" ADD CONSTRAINT "sparring_availability_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "open_lobbies_host_idx" ON "open_lobbies" USING btree ("host_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sparring_player_league_idx" ON "sparring_availability" USING btree ("player_id","league_id");--> statement-breakpoint
CREATE INDEX "sparring_league_expires_idx" ON "sparring_availability" USING btree ("league_id","expires_at");