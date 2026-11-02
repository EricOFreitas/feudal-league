ALTER TABLE "leagues" ADD COLUMN "match_scope" varchar(12) DEFAULT 'ranked_lobby' NOT NULL;--> statement-breakpoint
UPDATE "leagues" SET "match_scope" = 'lobby' WHERE NOT "count_ranked";
