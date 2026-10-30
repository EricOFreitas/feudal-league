ALTER TABLE "league_members" ADD COLUMN "source" varchar(8) DEFAULT 'join' NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "points_win" smallint DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "points_loss" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "count_non_members" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "auto_join_opponents" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "auto_join_checked_at" timestamp with time zone;