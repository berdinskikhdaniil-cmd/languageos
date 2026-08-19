CREATE TYPE "public"."mistake_practice_item_type" AS ENUM('fill_blank', 'rewrite');--> statement-breakpoint
CREATE TYPE "public"."mistake_practice_status" AS ENUM('generating', 'ready', 'grading', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."mistake_practice_target_type" AS ENUM('skill', 'category');--> statement-breakpoint
CREATE TYPE "public"."mistake_practice_verdict" AS ENUM('correct', 'acceptable', 'incorrect');--> statement-breakpoint
CREATE TABLE "mistake_practice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" "mistake_practice_item_type" NOT NULL,
	"prompt" text NOT NULL,
	"canonical_answer" text NOT NULL,
	"grading_notes" text,
	"user_answer" text,
	"verdict" "mistake_practice_verdict",
	"corrected_answer" text,
	"explanation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mistake_practice_items_position_range" CHECK ("mistake_practice_items"."position" between 1 and 5),
	CONSTRAINT "mistake_practice_items_prompt_length" CHECK (char_length("mistake_practice_items"."prompt") between 1 and 600),
	CONSTRAINT "mistake_practice_items_canonical_answer_length" CHECK (char_length("mistake_practice_items"."canonical_answer") between 1 and 600),
	CONSTRAINT "mistake_practice_items_user_answer_length" CHECK ("mistake_practice_items"."user_answer" is null or char_length("mistake_practice_items"."user_answer") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "mistake_practice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"user_language_id" uuid NOT NULL,
	"target_type" "mistake_practice_target_type" NOT NULL,
	"target_key" text NOT NULL,
	"status" "mistake_practice_status" DEFAULT 'generating' NOT NULL,
	"model" text NOT NULL,
	"grading_model" text,
	"generation_input_tokens" integer,
	"generation_output_tokens" integer,
	"grading_input_tokens" integer,
	"grading_output_tokens" integer,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "mistake_practice_sessions_target_key_present" CHECK (char_length("mistake_practice_sessions"."target_key") between 1 and 120),
	CONSTRAINT "mistake_practice_sessions_completed_has_timestamp" CHECK ("mistake_practice_sessions"."status" <> 'completed' or "mistake_practice_sessions"."completed_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "mistake_practice_items" ADD CONSTRAINT "mistake_practice_items_session_id_mistake_practice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."mistake_practice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mistake_practice_sessions" ADD CONSTRAINT "mistake_practice_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mistake_practice_sessions" ADD CONSTRAINT "mistake_practice_sessions_user_language_belongs_to_user_fk" FOREIGN KEY ("user_id","user_language_id") REFERENCES "public"."user_languages"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mistake_practice_items_session_position_unique" ON "mistake_practice_items" USING btree ("session_id","position");--> statement-breakpoint
CREATE INDEX "mistake_practice_sessions_user_created_at_idx" ON "mistake_practice_sessions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mistake_practice_sessions_one_generating_per_target" ON "mistake_practice_sessions" USING btree ("user_id","target_type","target_key") WHERE "mistake_practice_sessions"."status" = 'generating';