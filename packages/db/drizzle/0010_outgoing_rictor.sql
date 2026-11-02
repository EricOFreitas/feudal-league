CREATE TABLE "player_medals" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"season_id" integer NOT NULL,
	"division_id" integer NOT NULL,
	"position" smallint NOT NULL,
	"points" integer NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "podium_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "player_medals" ADD CONSTRAINT "player_medals_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_medals" ADD CONSTRAINT "player_medals_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_medals" ADD CONSTRAINT "player_medals_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_medals_place_idx" ON "player_medals" USING btree ("season_id","division_id","position");--> statement-breakpoint
CREATE INDEX "player_medals_player_idx" ON "player_medals" USING btree ("player_id");--> statement-breakpoint
UPDATE "seasons" SET "ends_at" = '2026-12-01T03:00:00Z' WHERE "ended_at" IS NULL AND "started_at" < '2026-12-01T03:00:00Z' AND "league_id" IN (SELECT "id" FROM "leagues" WHERE "is_global");
