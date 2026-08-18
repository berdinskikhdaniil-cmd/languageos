-- The unique key must exist before a foreign key can reference the pair.
ALTER TABLE "user_languages" ADD CONSTRAINT "user_languages_id_user_id_key" UNIQUE("user_id","id");--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_language_id_user_languages_id_fk";--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_language_belongs_to_user_fk" FOREIGN KEY ("user_id","user_language_id") REFERENCES "public"."user_languages"("user_id","id") ON DELETE cascade ON UPDATE no action;
