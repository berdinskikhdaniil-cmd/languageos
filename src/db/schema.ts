import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
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
  /** Set once Telegram authentication lands. Unique when present. */
  telegramUserId: bigint("telegram_user_id", { mode: "number" }).unique(),
  firstName: text("first_name"),
  /** IANA zone. All day and week boundaries are computed in it. */
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_languages_user_code_unique").on(table.userId, table.languageCode),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userLanguageId: uuid("user_language_id")
      .notNull()
      .references(() => userLanguages.id, { onDelete: "cascade" }),
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
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  languages: many(userLanguages),
  sessions: many(sessions),
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
export type UserLanguageRow = typeof userLanguages.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
