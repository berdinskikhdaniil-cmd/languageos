ALTER TABLE "speaking_attempts" DROP CONSTRAINT "speaking_attempts_tracker_session_belongs_to_user_fk";
--> statement-breakpoint
ALTER TABLE "speaking_attempts" ADD CONSTRAINT "speaking_attempts_tracker_session_fk" FOREIGN KEY ("tracker_session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;