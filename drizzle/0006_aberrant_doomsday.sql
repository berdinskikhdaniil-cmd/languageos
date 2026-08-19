CREATE TYPE "public"."speaking_attempt_status" AS ENUM('transcribing', 'transcribed', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."speaking_content_verdict" AS ENUM('yes', 'partly', 'no');--> statement-breakpoint
CREATE TYPE "public"."speaking_review_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "speaking_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"user_language_id" uuid NOT NULL,
	"client_request_id" text NOT NULL,
	"topic_key" text NOT NULL,
	"topic_prompt" text NOT NULL,
	"status" "speaking_attempt_status" DEFAULT 'transcribing' NOT NULL,
	"duration_seconds" integer NOT NULL,
	"audio_format" text,
	"audio_bytes" integer,
	"transcript" text,
	"stt_model" text,
	"stt_seconds" real,
	"stt_cost_usd" double precision,
	"failure_reason" text,
	"tracker_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "speaking_attempts_duration_range" CHECK ("speaking_attempts"."duration_seconds" between 1 and 91),
	CONSTRAINT "speaking_attempts_transcribed_has_text" CHECK ("speaking_attempts"."status" in ('transcribing', 'failed') or "speaking_attempts"."transcript" is not null)
);
--> statement-breakpoint
CREATE TABLE "speaking_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"category" "writing_issue_category" NOT NULL,
	"label" text,
	"severity" "writing_issue_severity" NOT NULL,
	"original_fragment" text NOT NULL,
	"suggestion" text NOT NULL,
	"explanation" text NOT NULL,
	"start_offset" integer,
	"end_offset" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "speaking_issues_offsets_paired" CHECK (("speaking_issues"."start_offset" is null) = ("speaking_issues"."end_offset" is null)),
	CONSTRAINT "speaking_issues_offsets_ordered" CHECK ("speaking_issues"."start_offset" is null or ("speaking_issues"."start_offset" >= 0 and "speaking_issues"."end_offset" > "speaking_issues"."start_offset"))
);
--> statement-breakpoint
CREATE TABLE "speaking_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"status" "speaking_review_status" DEFAULT 'pending' NOT NULL,
	"model" text NOT NULL,
	"summary" text,
	"improved_answer" text,
	"content_verdict" "speaking_content_verdict",
	"content_comment" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "speaking_reviews_attempt_id_unique" UNIQUE("attempt_id"),
	CONSTRAINT "speaking_reviews_completed_has_content" CHECK ("speaking_reviews"."status" <> 'completed' or ("speaking_reviews"."summary" is not null and "speaking_reviews"."improved_answer" is not null))
);
--> statement-breakpoint
ALTER TABLE "speaking_attempts" ADD CONSTRAINT "speaking_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaking_attempts" ADD CONSTRAINT "speaking_attempts_user_language_belongs_to_user_fk" FOREIGN KEY ("user_id","user_language_id") REFERENCES "public"."user_languages"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaking_attempts" ADD CONSTRAINT "speaking_attempts_tracker_session_belongs_to_user_fk" FOREIGN KEY ("user_id","tracker_session_id") REFERENCES "public"."sessions"("user_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaking_issues" ADD CONSTRAINT "speaking_issues_review_id_speaking_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."speaking_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaking_reviews" ADD CONSTRAINT "speaking_reviews_attempt_id_speaking_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."speaking_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "speaking_attempts_user_request_unique" ON "speaking_attempts" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE INDEX "speaking_attempts_user_created_at_idx" ON "speaking_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "speaking_attempts_tracker_session_unique" ON "speaking_attempts" USING btree ("tracker_session_id") WHERE "speaking_attempts"."tracker_session_id" is not null;--> statement-breakpoint
CREATE INDEX "speaking_issues_review_id_idx" ON "speaking_issues" USING btree ("review_id","position");--> statement-breakpoint
CREATE INDEX "speaking_reviews_created_at_idx" ON "speaking_reviews" USING btree ("created_at");