CREATE TYPE "public"."ui_language" AS ENUM('en', 'ru');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ui_language" "ui_language" DEFAULT 'en' NOT NULL;--> statement-breakpoint
-- Backfill, hand-written: drizzle-kit generates schema, not data.
--
-- Additive and backward-compatible on purpose. The column arrives defaulted and
-- NOT NULL, so the deployment running underneath this migration — which knows
-- nothing about it — keeps inserting users exactly as before, and a rollback to
-- that deployment leaves the column filled and ignored rather than broken.
--
-- Everyone who signed in from a Russian-language Telegram client gets the
-- Russian interface on their next launch; everyone else keeps English. This is
-- the same one-time hint a new account gets, applied to accounts that predate
-- the setting. It runs once, and nothing afterwards ever reads
-- telegram_language_code to decide this again: from here on the column is the
-- learner's own choice.
UPDATE "users"
SET "ui_language" = 'ru'
WHERE lower("telegram_language_code") LIKE 'ru%';
