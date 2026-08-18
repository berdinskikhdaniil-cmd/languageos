-- The unique key must exist before the writing foreign key can reference
-- the (user_id, id) pair, so it is created first.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_id_user_id_key" UNIQUE("user_id","id");--> statement-breakpoint
CREATE TYPE "public"."writing_issue_category" AS ENUM('grammar', 'agreement', 'word_order', 'word_choice', 'spelling', 'punctuation', 'naturalness', 'style', 'other');--> statement-breakpoint
CREATE TYPE "public"."writing_issue_severity" AS ENUM('error', 'awkward', 'style');--> statement-breakpoint
CREATE TYPE "public"."writing_review_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."writing_type" AS ENUM('free_writing', 'retelling');--> statement-breakpoint
CREATE TABLE "writing_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"user_language_id" uuid NOT NULL,
	"type" "writing_type" NOT NULL,
	"original_text" text NOT NULL,
	"revised_text" text,
	"word_count" integer NOT NULL,
	"source_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "writing_entries_original_text_length" CHECK (char_length("writing_entries"."original_text") between 1 and 6000),
	CONSTRAINT "writing_entries_revised_text_length" CHECK ("writing_entries"."revised_text" is null or char_length("writing_entries"."revised_text") between 1 and 6000),
	CONSTRAINT "writing_entries_word_count_positive" CHECK ("writing_entries"."word_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "writing_issues" (
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
	CONSTRAINT "writing_issues_offsets_paired" CHECK (("writing_issues"."start_offset" is null) = ("writing_issues"."end_offset" is null)),
	CONSTRAINT "writing_issues_offsets_ordered" CHECK ("writing_issues"."start_offset" is null or ("writing_issues"."start_offset" >= 0 and "writing_issues"."end_offset" > "writing_issues"."start_offset"))
);
--> statement-breakpoint
CREATE TABLE "writing_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"status" "writing_review_status" DEFAULT 'pending' NOT NULL,
	"model" text NOT NULL,
	"summary" text,
	"improved_text" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "writing_reviews_entry_id_unique" UNIQUE("entry_id"),
	CONSTRAINT "writing_reviews_completed_has_content" CHECK ("writing_reviews"."status" <> 'completed' or ("writing_reviews"."summary" is not null and "writing_reviews"."improved_text" is not null))
);
--> statement-breakpoint
ALTER TABLE "writing_entries" ADD CONSTRAINT "writing_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_entries" ADD CONSTRAINT "writing_entries_user_language_belongs_to_user_fk" FOREIGN KEY ("user_id","user_language_id") REFERENCES "public"."user_languages"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_entries" ADD CONSTRAINT "writing_entries_source_session_belongs_to_user_fk" FOREIGN KEY ("user_id","source_session_id") REFERENCES "public"."sessions"("user_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_issues" ADD CONSTRAINT "writing_issues_review_id_writing_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."writing_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_reviews" ADD CONSTRAINT "writing_reviews_entry_id_writing_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."writing_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "writing_entries_user_created_at_idx" ON "writing_entries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "writing_issues_review_id_idx" ON "writing_issues" USING btree ("review_id","position");--> statement-breakpoint
CREATE INDEX "writing_reviews_created_at_idx" ON "writing_reviews" USING btree ("created_at");
