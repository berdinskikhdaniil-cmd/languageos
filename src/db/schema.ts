import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * What the learner was actually doing. Stored as the concrete activity, never
 * as a pre-aggregated bucket — the Input / Speaking / Writing grouping is a
 * presentation concern and lives in features/tracker/domain/activity.ts.
 */
export const activityTypeEnum = pgEnum("activity_type", [
  "video",
  "podcast",
  "reading",
  "conversation",
  "writing",
  "speaking",
  "other",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /**
   * The Telegram account this user signed in with. Unique when present; null
   * for the local development identity.
   *
   * Stored as a 64-bit bigint: Telegram ids already exceed 32 bits. `mode:
   * "number"` is safe because Telegram guarantees ids stay below 2^52, well
   * inside the range JavaScript integers represent exactly.
   */
  telegramUserId: bigint("telegram_user_id", { mode: "number" }).unique(),
  /** Profile fields mirrored from Telegram on each sign-in. All optional. */
  firstName: text("first_name"),
  lastName: text("last_name"),
  username: text("username"),
  photoUrl: text("photo_url"),
  telegramLanguageCode: text("telegram_language_code"),
  /**
   * IANA zone. All day and week boundaries are computed in it.
   *
   * "UTC" is a placeholder, not a guess about the learner: it is what a row
   * carries between sign-in and the end of onboarding, and onboarding is the
   * only thing that writes a real zone. Nothing user-facing reads it before
   * then, because an un-onboarded user never reaches a screen that counts days.
   */
  timezone: text("timezone").notNull().default("UTC"),
  /**
   * When first-run onboarding finished. NULL means the account is
   * authenticated but not set up: no language, no timezone, no goal.
   *
   * Deliberately a column and not an inference from "has a language row" —
   * onboarding is a product state, and reading it must not depend on the shape
   * of another table.
   */
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Our own sessions, deliberately independent of Telegram. Telegram's initData
 * authenticates once at launch; everything after that runs on one of these.
 *
 * Only the SHA-256 of the token is stored, so a database leak does not hand
 * anyone a usable session.
 */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("auth_sessions_user_id_idx").on(table.userId),
    index("auth_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const userLanguages = pgTable(
  "user_languages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** ISO 639-1 where possible, e.g. "en". */
    languageCode: text("language_code").notNull(),
    languageName: text("language_name").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    /**
     * How many minutes a day the learner is aiming for, in this language.
     *
     * The goal belongs to the language rather than the account: studying two
     * languages later means two targets, not one shared number.
     *
     * The default is 45 because that is the figure the dashboard drew for
     * everyone before goals were chosen — so rows that predate onboarding keep
     * showing exactly what they showed yesterday. Onboarding always writes an
     * explicit value and never relies on it.
     */
    dailyGoalMinutes: integer("daily_goal_minutes").notNull().default(45),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_languages_user_code_unique").on(table.userId, table.languageCode),
    /** Lets sessions reference (user, language) as a pair. See below. */
    unique("user_languages_id_user_id_key").on(table.userId, table.id),
    /**
     * A goal outside this range is a bug, not a preference. Enforced here so no
     * future code path can write one, whatever the UI offers.
     */
    check(
      "user_languages_daily_goal_minutes_range",
      sql`${table.dailyGoalMinutes} between 5 and 600`,
    ),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userLanguageId: uuid("user_language_id").notNull(),
    activityType: activityTypeEnum("activity_type").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    /** NULL means the session is still running. There is at most one per user. */
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Always derived from the timestamps server-side, never sent by a client. */
    durationSeconds: integer("duration_seconds"),
    sourceTitle: text("source_title"),
    sourceUrl: text("source_url"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * The whole "one timer at a time" rule, enforced by the database rather
     * than by hopeful application code.
     */
    uniqueIndex("sessions_one_active_per_user")
      .on(table.userId)
      .where(sql`${table.endedAt} is null`),
    index("sessions_user_started_at_idx").on(table.userId, table.startedAt),
    /**
     * A composite reference rather than one on user_language_id alone: it makes
     * it structurally impossible to file a session against somebody else's
     * language, whatever a future code path or a bug might try to insert.
     */
    foreignKey({
      columns: [table.userId, table.userLanguageId],
      foreignColumns: [userLanguages.userId, userLanguages.id],
      name: "sessions_user_language_belongs_to_user_fk",
    }).onDelete("cascade"),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  languages: many(userLanguages),
  sessions: many(sessions),
  authSessions: many(authSessions),
}));

export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(users, { fields: [authSessions.userId], references: [users.id] }),
}));

export const userLanguagesRelations = relations(userLanguages, ({ one, many }) => ({
  user: one(users, { fields: [userLanguages.userId], references: [users.id] }),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
  userLanguage: one(userLanguages, {
    fields: [sessions.userLanguageId],
    references: [userLanguages.id],
  }),
}));

export type UserRow = typeof users.$inferSelect;
export type AuthSessionRow = typeof authSessions.$inferSelect;
export type UserLanguageRow = typeof userLanguages.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
