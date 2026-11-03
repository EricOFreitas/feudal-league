CREATE TABLE "match_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" bigint NOT NULL,
	"profile_id" integer NOT NULL,
	"division_id" integer,
	"played_at" timestamp with time zone NOT NULL,
	"status" varchar(12) DEFAULT 'ok' NOT NULL,
	"error" text,
	"source" varchar(8) DEFAULT 'league' NOT NULL,
	"duration_s" integer,
	"feudal_s" integer,
	"castle_s" integer,
	"imperial_s" integer,
	"vils_10" smallint,
	"vils_15" smallint,
	"vils_20" smallint,
	"tc_idle_s" integer,
	"tc_idle_until_s" integer,
	"first_military_s" integer,
	"apm" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_metrics" ADD CONSTRAINT "match_metrics_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_metrics" ADD CONSTRAINT "match_metrics_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_metrics_match_profile_idx" ON "match_metrics" USING btree ("match_id","profile_id");--> statement-breakpoint
CREATE INDEX "match_metrics_division_idx" ON "match_metrics" USING btree ("division_id","played_at");--> statement-breakpoint
CREATE INDEX "match_metrics_profile_idx" ON "match_metrics" USING btree ("profile_id","played_at");