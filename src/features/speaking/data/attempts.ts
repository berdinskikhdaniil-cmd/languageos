import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions, speakingAttempts, speakingIssues, speakingReviews } from "@/db/schema";
import type { SpeakingAttemptRow, SpeakingIssueRow, SpeakingReviewRow } from "@/db/schema";

/**
 * Every read and write of a spoken attempt.
 *
 * Nothing here takes an attempt id on its own: an id always travels with the
 * owner's user id, so a URL carrying somebody else's uuid resolves to nothing
 * rather than to their recording. The language is not accepted from a caller
 * either — it comes from the authenticated user's own primary language, and the
 * composite foreign key on (user_id, user_language_id) means the database would
 * refuse it even if a code path tried.
 *
 * The audio never reaches this file. It is transcribed and dropped in the
 * route handler; what is stored is what a learner can act on.
 */

export type SpeakingAttemptDetail = {
  attempt: SpeakingAttemptRow;
  review: SpeakingReviewRow | null;
  issues: SpeakingIssueRow[];
};

/**
 * Claims an attempt, or hands back the one this submission already made.
 *
 * The second half is the whole of the idempotency story. A double tap sends the
 * same `clientRequestId` twice; the unique index on (user_id, client_request_id)
 * turns the loser into a lookup, so a second transcription is never started and
 * a second charge never happens. `created` tells the caller which one it is —
 * only the creator may go on to spend a transcription.
 */
export async function claimSpeakingAttempt({
  userId,
  userLanguageId,
  clientRequestId,
  topicKey,
  topicPrompt,
  durationSeconds,
  audioFormat,
  audioBytes,
}: {
  userId: string;
  userLanguageId: string;
  clientRequestId: string;
  topicKey: string;
  topicPrompt: string;
  durationSeconds: number;
  audioFormat: string;
  audioBytes: number;
}): Promise<{ created: boolean; attempt: SpeakingAttemptRow } | null> {
  const [inserted] = await db
    .insert(speakingAttempts)
    .values({
      userId,
      userLanguageId,
      clientRequestId,
      topicKey,
      topicPrompt,
      durationSeconds,
      audioFormat,
      audioBytes,
      status: "transcribing",
    })
    .onConflictDoNothing({
      target: [speakingAttempts.userId, speakingAttempts.clientRequestId],
    })
    .returning();

  if (inserted) return { created: true, attempt: inserted };

  /**
   * Scoped to this user, always. Another account cannot be reached by guessing
   * a request id, because the lookup carries our own user id as well.
   */
  const [existing] = await db
    .select()
    .from(speakingAttempts)
    .where(
      and(
        eq(speakingAttempts.userId, userId),
        eq(speakingAttempts.clientRequestId, clientRequestId),
      ),
    )
    .limit(1);

  return existing ? { created: false, attempt: existing } : null;
}

/** The attempt and everything hanging off it, or null when it is not this user's. */
export async function getSpeakingAttempt(
  attemptId: string,
  userId: string,
): Promise<SpeakingAttemptDetail | null> {
  const [attempt] = await db
    .select()
    .from(speakingAttempts)
    .where(and(eq(speakingAttempts.id, attemptId), eq(speakingAttempts.userId, userId)))
    .limit(1);

  if (!attempt) return null;

  const [review] = await db
    .select()
    .from(speakingReviews)
    .where(eq(speakingReviews.attemptId, attempt.id))
    .limit(1);

  const issues = review
    ? await db
        .select()
        .from(speakingIssues)
        .where(eq(speakingIssues.reviewId, review.id))
        .orderBy(speakingIssues.position)
    : [];

  return { attempt, review: review ?? null, issues };
}

/**
 * Records a transcript, and the provider's own account of what it cost.
 *
 * `sttSeconds` is the audio's real length as the transcriber measured it, and
 * it replaces the duration the browser reported: a client's stopwatch is a
 * convenience, and this is what the tracker will count as study time.
 */
export async function saveTranscript({
  attemptId,
  transcript,
  model,
  seconds,
  costUsd,
  now = new Date(),
}: {
  attemptId: string;
  transcript: string;
  model: string;
  seconds: number | null;
  costUsd: number | null;
  now?: Date;
}): Promise<SpeakingAttemptRow | null> {
  const [updated] = await db
    .update(speakingAttempts)
    .set({
      status: "transcribed",
      transcript,
      sttModel: model,
      sttSeconds: seconds,
      sttCostUsd: costUsd,
      failureReason: null,
      updatedAt: now,
      // Only when the provider actually measured it, and never outside the cap
      // the column's own CHECK enforces.
      ...(seconds === null ? {} : { durationSeconds: clampDuration(seconds) }),
    })
    .where(eq(speakingAttempts.id, attemptId))
    .returning();

  return updated ?? null;
}

/**
 * Records that a recording never became text.
 *
 * `reason` is an internal code kept for whoever reads the logs. The learner is
 * told one calm sentence — and, because the audio was not kept, is offered a
 * fresh recording rather than a retry of something we no longer hold.
 */
export async function failTranscription({
  attemptId,
  reason,
  now = new Date(),
}: {
  attemptId: string;
  reason: string;
  now?: Date;
}): Promise<void> {
  await db
    .update(speakingAttempts)
    .set({ status: "failed", failureReason: reason, updatedAt: now })
    .where(eq(speakingAttempts.id, attemptId));
}

/**
 * The last few spoken attempts, for the short list on Practice.
 *
 * Scoped twice over, exactly like recent writing: to the account, and to the
 * language currently being studied. Not a history feature and not meant to
 * become one by accident — no paging, no filter.
 */
export type RecentSpeakingAttempt = {
  id: string;
  topicPrompt: string;
  durationSeconds: number;
  createdAt: Date;
  status: SpeakingAttemptRow["status"];
};

export async function getRecentSpeakingAttempts({
  userId,
  userLanguageId,
  limit = 3,
}: {
  userId: string;
  userLanguageId: string;
  limit?: number;
}): Promise<RecentSpeakingAttempt[]> {
  return db
    .select({
      id: speakingAttempts.id,
      topicPrompt: speakingAttempts.topicPrompt,
      durationSeconds: speakingAttempts.durationSeconds,
      createdAt: speakingAttempts.createdAt,
      status: speakingAttempts.status,
    })
    .from(speakingAttempts)
    .where(
      and(
        eq(speakingAttempts.userId, userId),
        eq(speakingAttempts.userLanguageId, userLanguageId),
      ),
    )
    .orderBy(desc(speakingAttempts.createdAt))
    .limit(limit);
}

/**
 * Files a completed attempt as study time, exactly once.
 *
 * Three things make "exactly once" true rather than hoped for. The row is
 * locked before it is read, so two requests cannot both see a null. The update
 * only matches while `tracker_session_id` is still null, so the loser writes
 * nothing. And a partial unique index on that column means the database itself
 * would refuse a second session even if both of those failed.
 *
 * The session is dated from the recording, not from now-plus-processing: the
 * learner spent `durationSeconds` speaking, and transcription time is ours, not
 * theirs.
 */
export async function linkTrackerSession({
  attemptId,
  userId,
  userLanguageId,
  now = new Date(),
}: {
  attemptId: string;
  userId: string;
  userLanguageId: string;
  now?: Date;
}): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [attempt] = await tx
      .select({
        id: speakingAttempts.id,
        durationSeconds: speakingAttempts.durationSeconds,
        trackerSessionId: speakingAttempts.trackerSessionId,
      })
      .from(speakingAttempts)
      .where(and(eq(speakingAttempts.id, attemptId), eq(speakingAttempts.userId, userId)))
      .limit(1)
      .for("update");

    if (!attempt) return null;
    // Already counted. A retried review must never add a second session.
    if (attempt.trackerSessionId) return attempt.trackerSessionId;

    const endedAt = now;
    const startedAt = new Date(endedAt.getTime() - attempt.durationSeconds * 1000);

    const [session] = await tx
      .insert(sessions)
      .values({
        userId,
        userLanguageId,
        activityType: "speaking",
        startedAt,
        endedAt,
        durationSeconds: attempt.durationSeconds,
      })
      .returning({ id: sessions.id });

    if (!session) return null;

    const [linked] = await tx
      .update(speakingAttempts)
      .set({ trackerSessionId: session.id, updatedAt: now })
      .where(
        and(eq(speakingAttempts.id, attemptId), isNull(speakingAttempts.trackerSessionId)),
      )
      .returning({ id: speakingAttempts.trackerSessionId });

    if (!linked) {
      // Lost the race after all. Roll the orphan session back rather than
      // leaving unattributed time on somebody's dashboard.
      throw new TrackerLinkRaceError();
    }

    return session.id;
  }).catch((error) => {
    if (error instanceof TrackerLinkRaceError) return null;
    throw error;
  });
}

class TrackerLinkRaceError extends Error {}

/** Marks the attempt finished. Called once its review has been written. */
export async function completeAttempt({
  attemptId,
  now = new Date(),
}: {
  attemptId: string;
  now?: Date;
}): Promise<void> {
  await db
    .update(speakingAttempts)
    .set({ status: "completed", updatedAt: now })
    .where(eq(speakingAttempts.id, attemptId));
}

/** How many attempts this user has started since a given instant. */
export async function countAttemptsSince(userId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(speakingAttempts)
    .where(
      and(
        eq(speakingAttempts.userId, userId),
        sql`${speakingAttempts.createdAt} >= ${since}`,
      ),
    );

  return row?.count ?? 0;
}

/** Mirrors the column's CHECK, so a provider's odd number cannot break an insert. */
function clampDuration(seconds: number): number {
  return Math.min(91, Math.max(1, Math.round(seconds)));
}
