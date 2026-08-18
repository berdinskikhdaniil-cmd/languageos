import { and, asc, gte, isNull, lt } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import type { ActivityType } from "../domain/activity";
import { completedDurationSeconds } from "../domain/manual-entry";

/**
 * Every read and write the tracker performs. UI components never touch the
 * database directly; they go through here or through the summary module.
 */

/** Raised when the caller broke a tracker rule, as opposed to the DB failing. */
export class TrackerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrackerError";
  }
}

/** Postgres unique-violation, i.e. the one-active-session index fired. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export async function getActiveSession(userId: string) {
  const [active] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.endedAt)))
    .limit(1);

  return active ?? null;
}

export async function getSessionsInInterval(userId: string, from: Date, to: Date) {
  return db
    .select({
      activityType: sessions.activityType,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      durationSeconds: sessions.durationSeconds,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gte(sessions.startedAt, from), lt(sessions.startedAt, to)))
    .orderBy(asc(sessions.startedAt));
}

export async function startSession({
  userId,
  userLanguageId,
  activityType,
  startedAt,
}: {
  userId: string;
  userLanguageId: string;
  activityType: ActivityType;
  startedAt: Date;
}) {
  // Checked here for a clear message, and enforced by a partial unique index in
  // case two requests arrive at once.
  if (await getActiveSession(userId)) {
    throw new TrackerError("A session is already running. Stop it before starting another.");
  }

  try {
    const [created] = await db
      .insert(sessions)
      .values({ userId, userLanguageId, activityType, startedAt })
      .returning();

    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TrackerError("A session is already running. Stop it before starting another.");
    }
    throw error;
  }
}

/**
 * Closes the running session. The duration is recomputed from the timestamps —
 * a client is never trusted to report how long it studied.
 *
 * Very short sessions are kept: silently discarding them would lose real data
 * and confuse anyone who meant to log a two-minute exchange.
 */
export async function stopSession({ userId, endedAt }: { userId: string; endedAt: Date }) {
  const active = await getActiveSession(userId);
  if (!active) {
    throw new TrackerError("No session is running.");
  }

  const [stopped] = await db
    .update(sessions)
    .set({
      endedAt,
      durationSeconds: completedDurationSeconds(active.startedAt, endedAt),
      updatedAt: new Date(),
    })
    .where(and(eq(sessions.id, active.id), isNull(sessions.endedAt)))
    .returning();

  if (!stopped) {
    throw new TrackerError("That session was already stopped.");
  }

  return stopped;
}

/** Discards a running session entirely — for a timer started by mistake. */
export async function cancelSession({ userId }: { userId: string }) {
  const active = await getActiveSession(userId);
  if (!active) {
    throw new TrackerError("No session is running.");
  }

  await db.delete(sessions).where(and(eq(sessions.id, active.id), isNull(sessions.endedAt)));
}

export async function createManualSession({
  userId,
  userLanguageId,
  activityType,
  startedAt,
  endedAt,
  durationSeconds,
  sourceTitle,
  note,
}: {
  userId: string;
  userLanguageId: string;
  activityType: ActivityType;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  sourceTitle: string | null;
  note: string | null;
}) {
  const [created] = await db
    .insert(sessions)
    .values({
      userId,
      userLanguageId,
      activityType,
      startedAt,
      endedAt,
      durationSeconds,
      sourceTitle,
      note,
    })
    .returning();

  return created;
}
