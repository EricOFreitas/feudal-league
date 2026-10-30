ALTER TABLE "tournaments" ADD COLUMN "max_peak_rating" integer;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "min_games" smallint;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "min_recent_games" smallint;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "prize" text;