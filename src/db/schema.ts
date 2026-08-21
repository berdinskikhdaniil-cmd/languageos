import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
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

/**
 * Which language the interface is drawn in.
 *
 * An enum rather than a text column: there are exactly two, and a typo in a
 * preference should be refused by the database rather than render an English
 * screen to somebody who asked for Russian. The values mirror
 * `UI_LANGUAGES` in lib/i18n/locale.ts, and a test holds the two together —
 * they are not imported here because drizzle-kit loads this file on its own.
 */
export const uiLanguageEnum = pgEnum("ui_language", ["en", "ru"]);

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
   * The learner's own choice of interface language, and the only source of
   * truth for it.
   *
   * `telegram_language_code` above is a mirror of what Telegram reports and is
   * refreshed on every sign-in; this column is not. Telegram's tag seeds it once,
   * when the row is created, and after that only Settings writes here — a
   * Telegram client set to another language must never overrule somebody who
   * chose.
   *
   * Defaulted rather than nullable: every screen needs a language, and "not
   * chosen yet" is not a state any of them could render.
   */
  uiLanguage: uiLanguageEnum("ui_language").notNull().default("en"),
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
     * Lets another table reference (user, session) as a pair, the same way
     * user_languages does. Writing uses it so a retelling can only ever point
     * at a session its own owner recorded.
     */
    unique("sessions_id_user_id_key").on(table.userId, table.id),
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

/** Free writing, or retelling something the learner watched, read or heard. */
export const writingTypeEnum = pgEnum("writing_type", ["free_writing", "retelling"]);

/**
 * Where a review is in its one and only lifecycle. The row is created
 * `pending` before the provider is called, which is what makes it a lock as
 * well as a record — see features/writing/data/reviews.ts.
 */
export const writingReviewStatusEnum = pgEnum("writing_review_status", [
  "pending",
  "completed",
  "failed",
]);

/**
 * Broad, language-neutral buckets. Defined once in
 * features/writing/domain/review.ts; this enum is the storage half of that
 * list and a test holds the two together.
 */
export const writingIssueCategoryEnum = pgEnum("writing_issue_category", [
  "grammar",
  "agreement",
  "word_order",
  "word_choice",
  "spelling",
  "punctuation",
  "naturalness",
  "style",
  "other",
]);

export const writingIssueSeverityEnum = pgEnum("writing_issue_severity", [
  "error",
  "awkward",
  "style",
]);

export const writingEntries = pgTable(
  "writing_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userLanguageId: uuid("user_language_id").notNull(),
    type: writingTypeEnum("type").notNull(),
    /** Exactly what the learner wrote. Never rewritten by us, at any point. */
    originalText: text("original_text").notNull(),
    /** The learner's own second attempt. Null until they rewrite it. */
    revisedText: text("revised_text"),
    /** Of the original, at submission time. See domain/word-count.ts. */
    wordCount: integer("word_count").notNull(),
    /**
     * The tracker session this retelling is about, when there is one. Nullable
     * and unused by the interface today: it is here so a future "retell what
     * you just watched" has somewhere to point without a second migration.
     */
    sourceSessionId: uuid("source_session_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("writing_entries_user_created_at_idx").on(table.userId, table.createdAt),
    /**
     * The same composite reference the tracker uses: it is structurally
     * impossible to file writing against somebody else's language, whatever a
     * future code path might try to insert.
     */
    foreignKey({
      columns: [table.userId, table.userLanguageId],
      foreignColumns: [userLanguages.userId, userLanguages.id],
      name: "writing_entries_user_language_belongs_to_user_fk",
    }).onDelete("cascade"),
    /** And the same for the optional session this entry may refer to. */
    foreignKey({
      columns: [table.userId, table.sourceSessionId],
      foreignColumns: [sessions.userId, sessions.id],
      name: "writing_entries_source_session_belongs_to_user_fk",
    }).onDelete("set null"),
    /**
     * The cost boundary, in the database rather than only in validation.
     * Mirrors MAX_WRITING_CHARS in features/writing/domain/writing-entry.ts.
     */
    check("writing_entries_original_text_length", sql`char_length(${table.originalText}) between 1 and 6000`),
    check(
      "writing_entries_revised_text_length",
      sql`${table.revisedText} is null or char_length(${table.revisedText}) between 1 and 6000`,
    ),
    check("writing_entries_word_count_positive", sql`${table.wordCount} >= 0`),
  ],
);

export const writingReviews = pgTable(
  "writing_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Unique: one review per entry, for this iteration and as the mechanism
     * that makes a double submission harmless. A second attempt collides here
     * rather than calling the provider again.
     */
    entryId: uuid("entry_id")
      .notNull()
      .unique()
      .references(() => writingEntries.id, { onDelete: "cascade" }),
    status: writingReviewStatusEnum("status").notNull().default("pending"),
    /** Whatever answered, as the provider reported it — not what we asked for. */
    model: text("model").notNull(),
    summary: text("summary"),
    improvedText: text("improved_text"),
    /** As reported by the provider. Null when it said nothing about usage. */
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    /**
     * A short internal reason code for a failed attempt, e.g. "timeout". Never
     * shown to the learner, who gets one calm sentence instead.
     */
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("writing_reviews_created_at_idx").on(table.createdAt),
    /** A completed review without its content would render as an empty screen. */
    check(
      "writing_reviews_completed_has_content",
      sql`${table.status} <> 'completed' or (${table.summary} is not null and ${table.improvedText} is not null)`,
    ),
  ],
);

export const writingIssues = pgTable(
  "writing_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => writingReviews.id, { onDelete: "cascade" }),
    /** Display and grouping order, as the review returned them. */
    position: integer("position").notNull(),
    category: writingIssueCategoryEnum("category").notNull(),
    /** The specific weak point: "articles", "past tense", "case". Optional. */
    label: text("label"),
    severity: writingIssueSeverityEnum("severity").notNull(),
    originalFragment: text("original_fragment").notNull(),
    suggestion: text("suggestion").notNull(),
    explanation: text("explanation").notNull(),
    /**
     * Where the fragment sits in the original text, in UTF-16 code units —
     * resolved by us, never taken from the model. Null when the fragment could
     * not be placed unambiguously, which costs the issue its highlight and
     * nothing else.
     */
    startOffset: integer("start_offset"),
    endOffset: integer("end_offset"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("writing_issues_review_id_idx").on(table.reviewId, table.position),
    /** Half a span is not a span. */
    check(
      "writing_issues_offsets_paired",
      sql`(${table.startOffset} is null) = (${table.endOffset} is null)`,
    ),
    check(
      "writing_issues_offsets_ordered",
      sql`${table.startOffset} is null or (${table.startOffset} >= 0 and ${table.endOffset} > ${table.startOffset})`,
    ),
  ],
);

/**
 * Where a spoken answer has got to.
 *
 * Four states, and the split between the last two is the point: `failed` means
 * the recording never became text, and `transcribed` means it did but the
 * review has not finished. They are told apart because the recovery differs —
 * we do not keep the audio, so a failed transcription can only be answered by
 * recording again, while a failed review can be retried from the transcript we
 * already hold.
 */
export const speakingAttemptStatusEnum = pgEnum("speaking_attempt_status", [
  "transcribing",
  "transcribed",
  "completed",
  "failed",
]);

/**
 * The review's own lifecycle. Deliberately its own type rather than Writing's:
 * a status is per-feature machinery, and sharing one would only make the enum's
 * name lie about who uses it.
 *
 * The *issue taxonomy* below is shared, and that is the opposite decision made
 * on purpose — see speaking_issues.
 */
export const speakingReviewStatusEnum = pgEnum("speaking_review_status", [
  "pending",
  "completed",
  "failed",
]);

/** Did the answer address the topic? A verdict, never a score. */
export const speakingContentVerdictEnum = pgEnum("speaking_content_verdict", [
  "yes",
  "partly",
  "no",
]);

/**
 * One spoken answer to one topic.
 *
 * The audio is not here, and that is the design rather than an omission: the
 * recording reaches the server, goes to the transcriber, and the bytes are
 * dropped. What is worth keeping is what the learner can act on — how long they
 * spoke, what they said, and what the review made of it.
 */
export const speakingAttempts = pgTable(
  "speaking_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userLanguageId: uuid("user_language_id").notNull(),
    /**
     * The client's own id for this submission, and the whole of the idempotency
     * story. A double tap sends the same value twice; the unique index below
     * turns the second one into a lookup instead of a second recording, a
     * second transcription and a second charge.
     *
     * Deliberately not the primary key: a client-chosen id is a client-chosen
     * row, and scoping it to the user keeps one account's guess from touching
     * another's.
     */
    clientRequestId: text("client_request_id").notNull(),
    /** Which topic, as an identifier that survives the wording being improved. */
    topicKey: text("topic_key").notNull(),
    /** And the exact sentence the learner saw, frozen at the moment they saw it. */
    topicPrompt: text("topic_prompt").notNull(),
    status: speakingAttemptStatusEnum("status").notNull().default("transcribing"),
    /**
     * How long they actually spoke. Server-decided: the transcriber reports the
     * audio's real length, and the client's own number is only a fallback.
     * This is what the tracker counts.
     */
    durationSeconds: integer("duration_seconds").notNull(),
    /** "webm", "m4a" — kept to diagnose a platform, not to replay anything. */
    audioFormat: text("audio_format"),
    audioBytes: integer("audio_bytes"),
    transcript: text("transcript"),
    sttModel: text("stt_model"),
    /** Audio seconds as the provider measured them, and its own cost report. */
    sttSeconds: real("stt_seconds"),
    sttCostUsd: doublePrecision("stt_cost_usd"),
    /** An internal code for a failed transcription. Never shown to a learner. */
    failureReason: text("failure_reason"),
    /**
     * The tracker session this attempt produced, once it completed. Nullable
     * because it does not exist until then, and unique because an attempt must
     * never be able to count twice.
     */
    trackerSessionId: uuid("tracker_session_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** One attempt per client submission, per account. The idempotency key. */
    uniqueIndex("speaking_attempts_user_request_unique").on(table.userId, table.clientRequestId),
    index("speaking_attempts_user_created_at_idx").on(table.userId, table.createdAt),
    /**
     * The same composite reference the tracker and Writing use: it is
     * structurally impossible to file a spoken answer against somebody else's
     * language, whatever a future code path might try to insert.
     */
    foreignKey({
      columns: [table.userId, table.userLanguageId],
      foreignColumns: [userLanguages.userId, userLanguages.id],
      name: "speaking_attempts_user_language_belongs_to_user_fk",
    }).onDelete("cascade"),
    /**
     * The tracker session this attempt produced.
     *
     * A single-column reference, deliberately, where the language above is a
     * composite one. `ON DELETE SET NULL` on a composite key nulls *every*
     * column in it — including `user_id`, which is NOT NULL — so a composite
     * reference here would make deleting a session fail, or corrupt the row if
     * it did not. The ownership it would have bought is already guaranteed
     * without it: the session is created by `linkTrackerSession` inside a
     * transaction, from the attempt's own `user_id`, and no client ever supplies
     * a session id.
     */
    foreignKey({
      columns: [table.trackerSessionId],
      foreignColumns: [sessions.id],
      name: "speaking_attempts_tracker_session_fk",
    }).onDelete("set null"),
    /**
     * "Exactly one tracker session per completed attempt", in the database
     * rather than in hopeful application code. Two attempts can never point at
     * one session, and the code only ever writes this column while it is null.
     */
    uniqueIndex("speaking_attempts_tracker_session_unique")
      .on(table.trackerSessionId)
      .where(sql`${table.trackerSessionId} is not null`),
    /**
     * Mirrors MAX_SPEAKING_SECONDS in features/speaking/domain/recording.ts,
     * with a second of slack for a final chunk that lands past the cap.
     */
    check("speaking_attempts_duration_range", sql`${table.durationSeconds} between 1 and 91`),
    /** A completed attempt without its transcript would render as an empty screen. */
    check(
      "speaking_attempts_transcribed_has_text",
      sql`${table.status} in ('transcribing', 'failed') or ${table.transcript} is not null`,
    ),
  ],
);

export const speakingReviews = pgTable(
  "speaking_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Unique: one review per attempt, and the row is the claim that makes a
     *  double submission harmless — exactly as writing_reviews works. */
    attemptId: uuid("attempt_id")
      .notNull()
      .unique()
      .references(() => speakingAttempts.id, { onDelete: "cascade" }),
    status: speakingReviewStatusEnum("status").notNull().default("pending"),
    /** Whatever answered, as the provider reported it — not what we asked for. */
    model: text("model").notNull(),
    summary: text("summary"),
    /** The learner's own answer, said well. In the language being learned. */
    improvedAnswer: text("improved_answer"),
    /** Whether the answer addressed its topic, and a sentence about it. */
    contentVerdict: speakingContentVerdictEnum("content_verdict"),
    contentComment: text("content_comment"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("speaking_reviews_created_at_idx").on(table.createdAt),
    check(
      "speaking_reviews_completed_has_content",
      sql`${table.status} <> 'completed' or (${table.summary} is not null and ${table.improvedAnswer} is not null)`,
    ),
  ],
);

/**
 * One problem found in a spoken answer.
 *
 * The category and severity columns are Writing's enums, reused rather than
 * duplicated. That is deliberate: a learner who drops articles drops them in
 * both skills, and the mistake engine has to count that as one weak point. Two
 * parallel enums with identical values would halve every total for good. The
 * type names are historical — Writing declared them first — and renaming a live
 * enum is an expand-and-contract migration that would buy nothing today.
 */
export const speakingIssues = pgTable(
  "speaking_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => speakingReviews.id, { onDelete: "cascade" }),
    /** Display and grouping order, as the review returned them. */
    position: integer("position").notNull(),
    category: writingIssueCategoryEnum("category").notNull(),
    label: text("label"),
    severity: writingIssueSeverityEnum("severity").notNull(),
    originalFragment: text("original_fragment").notNull(),
    suggestion: text("suggestion").notNull(),
    explanation: text("explanation").notNull(),
    /**
     * Where the fragment sits in the transcript, in UTF-16 code units —
     * resolved by us, never taken from the model. Null when it could not be
     * placed, which costs the issue its highlight and nothing else.
     */
    startOffset: integer("start_offset"),
    endOffset: integer("end_offset"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("speaking_issues_review_id_idx").on(table.reviewId, table.position),
    check(
      "speaking_issues_offsets_paired",
      sql`(${table.startOffset} is null) = (${table.endOffset} is null)`,
    ),
    check(
      "speaking_issues_offsets_ordered",
      sql`${table.startOffset} is null or (${table.startOffset} >= 0 and ${table.endOffset} > ${table.startOffset})`,
    ),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  languages: many(userLanguages),
  sessions: many(sessions),
  authSessions: many(authSessions),
  writingEntries: many(writingEntries),
  speakingAttempts: many(speakingAttempts),
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

export const writingEntriesRelations = relations(writingEntries, ({ one }) => ({
  user: one(users, { fields: [writingEntries.userId], references: [users.id] }),
  userLanguage: one(userLanguages, {
    fields: [writingEntries.userLanguageId],
    references: [userLanguages.id],
  }),
  review: one(writingReviews),
}));

export const writingReviewsRelations = relations(writingReviews, ({ one, many }) => ({
  entry: one(writingEntries, {
    fields: [writingReviews.entryId],
    references: [writingEntries.id],
  }),
  issues: many(writingIssues),
}));

export const writingIssuesRelations = relations(writingIssues, ({ one }) => ({
  review: one(writingReviews, {
    fields: [writingIssues.reviewId],
    references: [writingReviews.id],
  }),
}));

export type UserRow = typeof users.$inferSelect;
export type AuthSessionRow = typeof authSessions.$inferSelect;
export type UserLanguageRow = typeof userLanguages.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type WritingEntryRow = typeof writingEntries.$inferSelect;
export type WritingReviewRow = typeof writingReviews.$inferSelect;
export type WritingIssueRow = typeof writingIssues.$inferSelect;
export type SpeakingAttemptRow = typeof speakingAttempts.$inferSelect;
export type SpeakingReviewRow = typeof speakingReviews.$inferSelect;
export type SpeakingIssueRow = typeof speakingIssues.$inferSelect;

/**
 * Which weak point a practice session is about.
 *
 * The same two kinds the mistake engine already reasons in — see
 * `MistakeSelection` in features/mistakes/domain/aggregate.ts. Two values rather
 * than one prefixed string, so nothing has to parse a key to know what it is.
 */
export const mistakePracticeTargetTypeEnum = pgEnum("mistake_practice_target_type", [
  "skill",
  "category",
]);

/**
 * Where a practice session has got to.
 *
 * Five states, and the two "in flight" ones are locks as well as records:
 * `generating` is claimed before the provider is called and `grading` is claimed
 * before the second call, so a double tap finds the work already taken rather
 * than paying for it twice.
 *
 * `failed` is generation's failure and only generation's. A grading attempt that
 * did not come back returns the row to `ready` with a reason on it — the answers
 * are safe, and the learner is offered the check again rather than a new set of
 * exercises they never asked for.
 */
export const mistakePracticeStatusEnum = pgEnum("mistake_practice_status", [
  "generating",
  "ready",
  "grading",
  "completed",
  "failed",
]);

/**
 * The two exercise shapes. Both ask the learner to produce language rather than
 * recognise it, which is why there is no multiple choice here.
 */
export const mistakePracticeItemTypeEnum = pgEnum("mistake_practice_item_type", [
  "fill_blank",
  "rewrite",
]);

/**
 * What the grader made of one answer.
 *
 * `acceptable` is the value that earns its place: natural language has more than
 * one right answer, and an answer that differs from the canonical one while
 * still satisfying the exercise is not a mistake. Without a third value the
 * grader would have to call it wrong.
 */
export const mistakePracticeVerdictEnum = pgEnum("mistake_practice_verdict", [
  "correct",
  "acceptable",
  "incorrect",
]);

/**
 * One short, targeted practice run over a weak point the learner actually has.
 *
 * The target is stored as the mistake engine's own canonical values — a
 * normalised English skill label, or a category identifier — never a translated
 * one, for the same reason issue categories are stored canonically: a Russian
 * interface must not create a second taxonomy.
 *
 * Nothing here writes to `writing_issues` or `speaking_issues`, and nothing here
 * files a tracker session. Practice is a separate fact about the learner; it
 * does not edit their history and it does not yet count as study time.
 */
export const mistakePracticeSessions = pgTable(
  "mistake_practice_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userLanguageId: uuid("user_language_id").notNull(),
    targetType: mistakePracticeTargetTypeEnum("target_type").notNull(),
    /** The normalised skill label, or the category identifier. Canonical, always. */
    targetKey: text("target_key").notNull(),
    status: mistakePracticeStatusEnum("status").notNull().default("generating"),
    /**
     * When somebody actually took the provider call on, as opposed to when the
     * session was created.
     *
     * The two used to be the same moment, because generation ran inside the
     * server action that created the row. It no longer does: the tap creates
     * the session and returns immediately so the learner lands on a screen
     * rather than watching a button, and the screen is what asks for the
     * exercises. That splits one lock into two, and this column is the second
     * of them — `status = 'generating'` says a set is owed for this target, and
     * this says a request is in flight for it right now.
     *
     * Null means nobody has started. A value older than the lease means whoever
     * did is gone, and the work may be taken over.
     */
    generationClaimedAt: timestamp("generation_claimed_at", { withTimezone: true }),
    /** Whatever answered the generation call, as the provider reported it. */
    model: text("model").notNull(),
    /** And whatever answered the grading call. Null until it has run. */
    gradingModel: text("grading_model"),
    generationInputTokens: integer("generation_input_tokens"),
    generationOutputTokens: integer("generation_output_tokens"),
    gradingInputTokens: integer("grading_input_tokens"),
    gradingOutputTokens: integer("grading_output_tokens"),
    /** An internal code — "timeout", "invalid_response". Never shown to a learner. */
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("mistake_practice_sessions_user_created_at_idx").on(table.userId, table.createdAt),
    /**
     * "One generation in flight per target", in the database rather than in
     * hopeful application code. Two taps on Practice race to insert; one wins
     * and calls the provider, the other finds the session already under way and
     * opens it instead of paying for a second set of exercises.
     */
    uniqueIndex("mistake_practice_sessions_one_generating_per_target")
      .on(table.userId, table.targetType, table.targetKey)
      .where(sql`${table.status} = 'generating'`),
    /**
     * The same composite reference the tracker, Writing and Speaking use: it is
     * structurally impossible to file practice against somebody else's language.
     */
    foreignKey({
      columns: [table.userId, table.userLanguageId],
      foreignColumns: [userLanguages.userId, userLanguages.id],
      name: "mistake_practice_sessions_user_language_belongs_to_user_fk",
    }).onDelete("cascade"),
    check("mistake_practice_sessions_target_key_present", sql`char_length(${table.targetKey}) between 1 and 120`),
    /** A completed session that never finished would render as a result with no date. */
    check(
      "mistake_practice_sessions_completed_has_timestamp",
      sql`${table.status} <> 'completed' or ${table.completedAt} is not null`,
    ),
  ],
);

/**
 * One exercise, and the one answer the learner gave it.
 *
 * Deliberately not a separate answers table: v1 keeps a single final answer per
 * exercise, and a second table would buy a history nothing asks for. Practising
 * the same weak point again is a new session, not a second attempt at these
 * five — which is also what keeps "no mastery model" honest.
 *
 * `grading_notes` is server-only context for the grader. It is never sent to the
 * browser before the set has been checked, because it describes the answer.
 */
export const mistakePracticeItems = pgTable(
  "mistake_practice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => mistakePracticeSessions.id, { onDelete: "cascade" }),
    /** 1 to 5, in the order they are worked through. */
    position: integer("position").notNull(),
    type: mistakePracticeItemTypeEnum("type").notNull(),
    prompt: text("prompt").notNull(),
    canonicalAnswer: text("canonical_answer").notNull(),
    gradingNotes: text("grading_notes"),
    /** Null until the learner answers. Trimmed and capped before it is written. */
    userAnswer: text("user_answer"),
    verdict: mistakePracticeVerdictEnum("verdict"),
    correctedAnswer: text("corrected_answer"),
    /** Short, in the learner's interface language, about this exercise's skill. */
    explanation: text("explanation"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** One exercise per slot. Also what makes re-persisting a generation safe. */
    uniqueIndex("mistake_practice_items_session_position_unique").on(
      table.sessionId,
      table.position,
    ),
    check("mistake_practice_items_position_range", sql`${table.position} between 1 and 5`),
    check("mistake_practice_items_prompt_length", sql`char_length(${table.prompt}) between 1 and 600`),
    check(
      "mistake_practice_items_canonical_answer_length",
      sql`char_length(${table.canonicalAnswer}) between 1 and 600`,
    ),
    /** Mirrors MAX_ANSWER_CHARS in features/mistake-practice/domain/answers.ts. */
    check(
      "mistake_practice_items_user_answer_length",
      sql`${table.userAnswer} is null or char_length(${table.userAnswer}) <= 1000`,
    ),
  ],
);

export const mistakePracticeSessionsRelations = relations(
  mistakePracticeSessions,
  ({ one, many }) => ({
    user: one(users, { fields: [mistakePracticeSessions.userId], references: [users.id] }),
    userLanguage: one(userLanguages, {
      fields: [mistakePracticeSessions.userLanguageId],
      references: [userLanguages.id],
    }),
    items: many(mistakePracticeItems),
  }),
);

export const mistakePracticeItemsRelations = relations(mistakePracticeItems, ({ one }) => ({
  session: one(mistakePracticeSessions, {
    fields: [mistakePracticeItems.sessionId],
    references: [mistakePracticeSessions.id],
  }),
}));

export type MistakePracticeSessionRow = typeof mistakePracticeSessions.$inferSelect;
export type MistakePracticeItemRow = typeof mistakePracticeItems.$inferSelect;
