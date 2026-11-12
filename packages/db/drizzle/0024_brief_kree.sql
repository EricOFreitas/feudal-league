ALTER TABLE "tournaments" ADD COLUMN "swiss_rounds" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "swiss_advance" smallint DEFAULT 8 NOT NULL;