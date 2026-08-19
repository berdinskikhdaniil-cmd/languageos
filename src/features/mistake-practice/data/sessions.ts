import { and, asc, desc, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { mistakePracticeItems, mistakePracticeSessions } from "@/db/schema";
import type { MistakePracticeItemRow, MistakePracticeSessionRow } from "@/db/schema";
import type { MistakeSelection } from "@/features/mistakes/domain/aggregate";
import type { AiUsage } from "@/lib/ai/openrouter";
import { normalizeAnswer } from "../domain/answers";
import type { GeneratedExercise } from "../domain/exercise";
import type { GradedAnswer } from "../domain/grading";
import { toStoredTarget } from "../domain/target";

/**
 * Every read and write of a practice session.
 *
 * Nothing here takes a session id on its own: an id always travels with the
 * owner's user id, so a URL carrying somebody else's uuid resolves to nothing
 * rather than to their exercises. The language is not accepted from a caller
 * either — it comes from the authenticated user's own primary language, and the
 * composite foreign key on (user_id, user_language_id) means the database would
 * refuse a mismatched pair even if a code path tried.
 *
 * The two expensive calls are each guarded by a claim, in the way Writing and
 * Speaking guard a review. A row's *status* is the lock: an update that only
 * matches while the row is still in the state we read is what makes a double tap
 * cost nothing, without a queue, a scheduler or a second service.
 */

/** A claim older than this is assumed abandoned: the function that held it died. */
const STALE_CLAIM_MS = 3 * 60 * 1000;

/** Postgres's unique violation. Two callers reached the same partial index. */
const UNIQUE_VIOLATION = "23505";

export type PracticeSessionDetail = {
  session: MistakePracticeSessionRow;
  /** In position order, 1 to 5. */
  items: MistakePracticeItemRow[];
};

export type GenerationClaim =
  /** This caller owns the generation and must finish or fail it. */
  | { status: "claimed"; session: MistakePracticeSessionRow }
  /** Another request is generating for this target right now. */
  | { status: "processing"; session: MistakePracticeSessionRow };

/**
 * Starts a session, or hands back the one already being generated.
 *
 * The partial unique index on (user_id, target_type, target_key) where the
 * status is `generating` is the whole of the idempotency story: two taps race
 * to insert, one wins and calls the provider, the loser finds the session under
 * way and opens it. Nothing is spent twice.
 *
 * A stale claim is taken over rather than left in the way. A serverless function
 * that died mid-call would otherwise lock this target out of practice for good.
 */
export async function startGeneration({
  userId,
  userLanguageId,
  target,
  model,
  now = new Date(),
}: {
  userId: string;
  userLanguageId: string;
  target: MistakeSelection;
  model: string;
  now?: Date;
}): Promise<GenerationClaim> {
  const stored = toStoredTarget(target);

  const [inserted] = await db
    .insert(mistakePracticeSessions)
    .values({
      userId,
      userLanguageId,
      targetType: stored.type,
      targetKey: stored.key,
      model,
      status: "generating",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [
        mistakePracticeSessions.userId,
        mistakePracticeSessions.targetType,
        mistakePracticeSessions.targetKey,
      ],
      // The partial index's own predicate, so Postgres can infer which index
      // this conflict is against. Without it the statement matches no unique
      // constraint at all and fails outright.
      where: eq(mistakePracticeSessions.status, "generating"),
    })
    .returning();

  if (inserted) return { status: "claimed", session: inserted };

  const [existing] = await db
    .select()
    .from(mistakePracticeSessions)
    .where(
      and(
        eq(mistakePracticeSessions.userId, userId),
        eq(mistakePracticeSessions.targetType, stored.type),
        eq(mistakePracticeSessions.targetKey, stored.key),
        eq(mistakePracticeSessions.status, "generating"),
      ),
    )
    .limit(1);

  if (!existing) {
    // The row moved on between the insert and the read. Trying once more is
    // correct and terminates: the second attempt sees a free index or a live row.
    return startGeneration({ userId, userLanguageId, target, model, now });
  }

  const [retaken] = await db
    .update(mistakePracticeSessions)
    .set({ model, failureReason: null, updatedAt: now })
    .where(
      and(
        eq(mistakePracticeSessions.id, existing.id),
        eq(mistakePracticeSessions.status, "generating"),
        lt(mistakePracticeSessions.updatedAt, new Date(now.getTime() - STALE_CLAIM_MS)),
      ),
    )
    .returning();

  return retaken ? { status: "claimed", session: retaken } : { status: "processing", session: existing };
}

/**
 * Asks for a failed session's exercises again, in place.
 *
 * The same row, deliberately: a retry must never leave a second session behind,
 * and the learner is looking at a URL that has to keep working. The status we
 * read is the lock, so two taps produce one generation.
 *
 * The unique index can still refuse this, when another session for the same
 * target is mid-generation. That is not an error — it is the answer "somebody
 * is already doing this", and it is reported as such.
 */
export async function reclaimGeneration({
  sessionId,
  userId,
  model,
  now = new Date(),
}: {
  sessionId: string;
  userId: string;
  model: string;
  now?: Date;
}): Promise<GenerationClaim | null> {
  const [session] = await db
    .select()
    .from(mistakePracticeSessions)
    .where(
      and(eq(mistakePracticeSessions.id, sessionId), eq(mistakePracticeSessions.userId, userId)),
    )
    .limit(1);

  if (!session) return null;
  if (session.status === "ready" || session.status === "completed") {
    return { status: "processing", session };
  }

  const stale = new Date(now.getTime() - STALE_CLAIM_MS);

  try {
    const [retaken] = await db
      .update(mistakePracticeSessions)
      .set({ status: "generating", model, failureReason: null, updatedAt: now })
      .where(
        and(
          eq(mistakePracticeSessions.id, session.id),
          or(
            eq(mistakePracticeSessions.status, "failed"),
            and(
              eq(mistakePracticeSessions.status, "generating"),
              lt(mistakePracticeSessions.updatedAt, stale),
            ),
          ),
        ),
      )
      .returning();

    return retaken ? { status: "claimed", session: retaken } : { status: "processing", session };
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "processing", session };
    throw error;
  }
}

/**
 * Writes the five exercises and opens the session, together.
 *
 * One transaction, so a session is never left `ready` with three exercises
 * under it because the second insert failed. Existing items are cleared first:
 * only the claim holder gets here, but a retry that reused a row must not stack
 * two sets of exercises on top of each other.
 */
export async function persistExercises({
  sessionId,
  model,
  exercises,
  usage,
  now = new Date(),
}: {
  sessionId: string;
  model: string;
  exercises: readonly GeneratedExercise[];
  usage: AiUsage;
  now?: Date;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(mistakePracticeItems).where(eq(mistakePracticeItems.sessionId, sessionId));

    await tx.insert(mistakePracticeItems).values(
      exercises.map((exercise, index) => ({
        sessionId,
        position: index + 1,
        type: exercise.type,
        prompt: exercise.prompt,
        canonicalAnswer: exercise.canonicalAnswer,
        gradingNotes: exercise.gradingNotes,
        createdAt: now,
        updatedAt: now,
      })),
    );

    await tx
      .update(mistakePracticeSessions)
      .set({
        status: "ready",
        model,
        generationInputTokens: usage.inputTokens,
        generationOutputTokens: usage.outputTokens,
        failureReason: null,
        updatedAt: now,
      })
      .where(eq(mistakePracticeSessions.id, sessionId));
  });
}

/**
 * Records that a set of exercises never arrived.
 *
 * `reason` is an internal code — "timeout", "invalid_response" — kept for
 * whoever reads the logs. The learner is told one calm sentence and offered the
 * button again; they never see this string.
 */
export async function failGeneration({
  sessionId,
  reason,
  now = new Date(),
}: {
  sessionId: string;
  reason: string;
  now?: Date;
}): Promise<void> {
  await db
    .update(mistakePracticeSessions)
    .set({ status: "failed", failureReason: reason, updatedAt: now })
    .where(eq(mistakePracticeSessions.id, sessionId));
}

/** The session and its exercises, or null when it is not this user's. */
export async function getPracticeSession(
  sessionId: string,
  userId: string,
): Promise<PracticeSessionDetail | null> {
  const [session] = await db
    .select()
    .from(mistakePracticeSessions)
    .where(
      and(eq(mistakePracticeSessions.id, sessionId), eq(mistakePracticeSessions.userId, userId)),
    )
    .limit(1);

  if (!session) return null;

  const items = await db
    .select()
    .from(mistakePracticeItems)
    .where(eq(mistakePracticeItems.sessionId, session.id))
    .orderBy(asc(mistakePracticeItems.position));

  return { session, items };
}

/**
 * Saves one answer, and only while the set is still open.
 *
 * The status predicate is what makes a graded session immutable: an answer sent
 * after the check — by a stale tab, a back button or a replayed request — no
 * longer matches, writes nothing, and cannot put a learner's screen out of step
 * with the verdicts beside it.
 *
 * Returns whether anything was written, so a caller can tell "saved" from "that
 * session is no longer taking answers" without a second read.
 */
export async function saveAnswer({
  sessionId,
  userId,
  position,
  answer,
  now = new Date(),
}: {
  sessionId: string;
  userId: string;
  position: number;
  answer: unknown;
  now?: Date;
}): Promise<boolean> {
  const [updated] = await db
    .update(mistakePracticeItems)
    .set({ userAnswer: normalizeAnswer(answer), updatedAt: now })
    .where(
      and(
        eq(mistakePracticeItems.sessionId, sessionId),
        eq(mistakePracticeItems.position, position),
        // The ownership and the "still open" checks in one place: the item is
        // only reachable through a session that is this user's and is `ready`.
        sql`exists (
          select 1 from ${mistakePracticeSessions}
          where ${mistakePracticeSessions.id} = ${sessionId}
            and ${mistakePracticeSessions.userId} = ${userId}
            and ${mistakePracticeSessions.status} = 'ready'
        )`,
      ),
    )
    .returning({ id: mistakePracticeItems.id });

  return Boolean(updated);
}

export type GradingClaim =
  | { status: "claimed"; detail: PracticeSessionDetail }
  /** Another request is checking this set right now. */
  | { status: "processing" }
  /** Already checked. Nothing more to spend. */
  | { status: "completed" }
  /** The session is not this user's, or is not in a state that can be checked. */
  | { status: "unavailable" };

/**
 * Takes ownership of checking a set, or explains who has it.
 *
 * `ready → grading` is a single conditional update, so of two taps only one ever
 * moves the row and only one ever calls the provider. A `grading` row older than
 * the stale window can be taken over, because a function that died holding the
 * claim must not lock a learner out of their own answers for good.
 */
export async function claimGrading({
  sessionId,
  userId,
  model,
  now = new Date(),
}: {
  sessionId: string;
  userId: string;
  model: string;
  now?: Date;
}): Promise<GradingClaim> {
  const [claimed] = await db
    .update(mistakePracticeSessions)
    .set({ status: "grading", gradingModel: model, failureReason: null, updatedAt: now })
    .where(
      and(
        eq(mistakePracticeSessions.id, sessionId),
        eq(mistakePracticeSessions.userId, userId),
        or(
          eq(mistakePracticeSessions.status, "ready"),
          and(
            eq(mistakePracticeSessions.status, "grading"),
            lt(mistakePracticeSessions.updatedAt, new Date(now.getTime() - STALE_CLAIM_MS)),
          ),
        ),
      ),
    )
    .returning();

  if (claimed) {
    const items = await db
      .select()
      .from(mistakePracticeItems)
      .where(eq(mistakePracticeItems.sessionId, claimed.id))
      .orderBy(asc(mistakePracticeItems.position));

    return { status: "claimed", detail: { session: claimed, items } };
  }

  const existing = await getPracticeSession(sessionId, userId);
  if (!existing) return { status: "unavailable" };
  if (existing.session.status === "completed") return { status: "completed" };
  if (existing.session.status === "grading") return { status: "processing" };
  return { status: "unavailable" };
}

/**
 * Writes every verdict and closes the session, together.
 *
 * One transaction, so a result screen is never drawn with two of five answers
 * graded. Nothing here touches `writing_issues`, `speaking_issues` or `sessions`
 * — practice is a separate fact about the learner, and their history of
 * mistakes is not edited by having practised.
 */
export async function completeGrading({
  sessionId,
  model,
  results,
  usage,
  now = new Date(),
}: {
  sessionId: string;
  model: string;
  results: readonly GradedAnswer[];
  usage: AiUsage;
  now?: Date;
}): Promise<void> {
  await db.transaction(async (tx) => {
    for (const result of results) {
      await tx
        .update(mistakePracticeItems)
        .set({
          verdict: result.verdict,
          correctedAnswer: result.correctedAnswer,
          explanation: result.explanation,
          updatedAt: now,
        })
        .where(
          and(
            eq(mistakePracticeItems.sessionId, sessionId),
            eq(mistakePracticeItems.position, result.position),
          ),
        );
    }

    await tx
      .update(mistakePracticeSessions)
      .set({
        status: "completed",
        gradingModel: model,
        gradingInputTokens: usage.inputTokens,
        gradingOutputTokens: usage.outputTokens,
        failureReason: null,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(mistakePracticeSessions.id, sessionId));
  });
}

/**
 * Records that a check did not come back, and reopens the set.
 *
 * Back to `ready`, never to `failed`: the answers are still there, they are
 * still the learner's five minutes of work, and the only thing that went wrong
 * is one provider call. The reason travels with the row so the screen can say
 * "saved, but not checked yet" rather than "start again".
 */
export async function failGrading({
  sessionId,
  reason,
  now = new Date(),
}: {
  sessionId: string;
  reason: string;
  now?: Date;
}): Promise<void> {
  await db
    .update(mistakePracticeSessions)
    .set({ status: "ready", failureReason: reason, updatedAt: now })
    .where(eq(mistakePracticeSessions.id, sessionId));
}

export type ResumablePractice = {
  sessionId: string;
  targetType: MistakePracticeSessionRow["targetType"];
  targetKey: string;
  /** How many of the five already have an answer saved. */
  answered: number;
};

/**
 * The set somebody walked away from, if there is one.
 *
 * A Mini App gets closed mid-exercise all the time — a message arrives, the
 * phone locks — and without this the work would simply be gone from view, sitting
 * in a table nothing links to. Only a set with at least one answer counts: a
 * session generated and never touched is not something anybody remembers
 * starting, and offering to "continue" it would be confusing.
 *
 * Scoped twice over, exactly like recent writing and recent speaking: to the
 * account, and to the language currently being studied.
 */
export async function getResumablePractice({
  userId,
  userLanguageId,
}: {
  userId: string;
  userLanguageId: string;
}): Promise<ResumablePractice | null> {
  const [row] = await db
    .select({
      sessionId: mistakePracticeSessions.id,
      targetType: mistakePracticeSessions.targetType,
      targetKey: mistakePracticeSessions.targetKey,
      answered: sql<number>`count(${mistakePracticeItems.id})::int`,
    })
    .from(mistakePracticeSessions)
    .innerJoin(
      mistakePracticeItems,
      and(
        eq(mistakePracticeItems.sessionId, mistakePracticeSessions.id),
        isNotNull(mistakePracticeItems.userAnswer),
      ),
    )
    .where(
      and(
        eq(mistakePracticeSessions.userId, userId),
        eq(mistakePracticeSessions.userLanguageId, userLanguageId),
        eq(mistakePracticeSessions.status, "ready"),
      ),
    )
    .groupBy(
      mistakePracticeSessions.id,
      mistakePracticeSessions.targetType,
      mistakePracticeSessions.targetKey,
      mistakePracticeSessions.createdAt,
    )
    .orderBy(desc(mistakePracticeSessions.createdAt))
    .limit(1);

  return row ?? null;
}

/** Only used by tests, to age a claim without waiting three minutes. */
export async function agePracticeSessionForTesting(
  sessionId: string,
  updatedAt: Date,
): Promise<void> {
  await db
    .update(mistakePracticeSessions)
    .set({ updatedAt })
    .where(eq(mistakePracticeSessions.id, sessionId));
}

/** Only used by tests and by the resume card: the answers actually stored. */
export async function readAnswers(sessionId: string): Promise<(string | null)[]> {
  const rows = await db
    .select({ userAnswer: mistakePracticeItems.userAnswer })
    .from(mistakePracticeItems)
    .where(inArray(mistakePracticeItems.sessionId, [sessionId]))
    .orderBy(asc(mistakePracticeItems.position));

  return rows.map((row) => row.userAnswer);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}
