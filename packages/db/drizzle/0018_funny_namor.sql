ALTER TABLE "tournaments" ADD COLUMN "registration_closed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "organizer_name" text;