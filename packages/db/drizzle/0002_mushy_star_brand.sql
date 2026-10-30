CREATE TABLE "match_analyses" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" bigint NOT NULL,
	"profile_id" integer NOT NULL,
	"requested_by_user_id" integer,
	"locale" varchar(5) DEFAULT 'pt' NOT NULL,
	"status" varchar(12) DEFAULT 'queued' NOT NULL,
	"error" text,
	"parse" jsonb,
	"model" text,
	"feedback" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"cost_micro_usd" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "match_analyses" ADD CONSTRAINT "match_analyses_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_analyses" ADD CONSTRAINT "match_analyses_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_analyses_match_profile_idx" ON "match_analyses" USING btree ("match_id","profile_id");--> statement-breakpoint
CREATE INDEX "match_analyses_user_time_idx" ON "match_analyses" USING btree ("requested_by_user_id","created_at");--> statement-breakpoint
CREATE INDEX "match_analyses_status_idx" ON "match_analyses" USING btree ("status","created_at");