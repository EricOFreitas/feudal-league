CREATE TABLE "tournament_images" (
	"tournament_id" integer PRIMARY KEY NOT NULL,
	"content_type" varchar(16) NOT NULL,
	"data" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tournament_images" ADD CONSTRAINT "tournament_images_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;