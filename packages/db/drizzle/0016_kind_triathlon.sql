CREATE TABLE "player_follows" (
	"user_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_follows_user_id_player_id_pk" PRIMARY KEY("user_id","player_id")
);
--> statement-breakpoint
ALTER TABLE "player_follows" ADD CONSTRAINT "player_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_follows" ADD CONSTRAINT "player_follows_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_follows_player_idx" ON "player_follows" USING btree ("player_id");