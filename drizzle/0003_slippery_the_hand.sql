ALTER TABLE "user_languages" ADD COLUMN "daily_goal_minutes" integer DEFAULT 45 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_languages" ADD CONSTRAINT "user_languages_daily_goal_minutes_range" CHECK ("user_languages"."daily_goal_minutes" between 5 and 600);--> statement-breakpoint
-- Backfill: anybody who already has a language was set up under the old
-- automatic-English bootstrap, so they are onboarded and must never be sent
-- through the first-run flow again. Their language, timezone, sessions and
-- auth sessions are untouched; the new goal column has already defaulted to
-- the 45 minutes the dashboard was drawing for them.
--
-- Idempotent, and safe under a rollback: the previous deployment ignores this
-- column entirely.
UPDATE "users"
SET "onboarding_completed_at" = now()
WHERE "onboarding_completed_at" IS NULL
  AND EXISTS (
    SELECT 1 FROM "user_languages" WHERE "user_languages"."user_id" = "users"."id"
  );
