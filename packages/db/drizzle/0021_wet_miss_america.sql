CREATE TABLE "tournament_organizers" (
	"tournament_id" integer NOT NULL,
	"profile_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_organizers_tournament_id_profile_id_pk" PRIMARY KEY("tournament_id","profile_id")
);
--> statement-breakpoint
ALTER TABLE "tournament_organizers" ADD CONSTRAINT "tournament_organizers_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;