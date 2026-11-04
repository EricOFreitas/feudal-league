CREATE TABLE "challenge_awards" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"league_id" integer NOT NULL,
	"division_id" integer,
	"week_start" date NOT NULL,
	"metric" varchar(16) NOT NULL,
	"matches" smallint NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "challenge_awards" ADD CONSTRAINT "challenge_awards_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_awards" ADD CONSTRAINT "challenge_awards_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_awards" ADD CONSTRAINT "challenge_awards_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_awards_player_week_idx" ON "challenge_awards" USING btree ("player_id","week_start");--> statement-breakpoint
CREATE INDEX "challenge_awards_week_idx" ON "challenge_awards" USING btree ("week_start");