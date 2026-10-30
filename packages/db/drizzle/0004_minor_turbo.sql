DROP INDEX "tournament_matches_round_pos_idx";--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD COLUMN "stage" varchar(8) DEFAULT 'bracket' NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD COLUMN "group_no" smallint;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD COLUMN "group_no" smallint;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "group_count" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "advance_per_group" smallint DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "group_best_of" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_matches_round_pos_idx" ON "tournament_matches" USING btree ("tournament_id","stage","round","position");