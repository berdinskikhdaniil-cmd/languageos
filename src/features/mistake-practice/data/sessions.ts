import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
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

/** A grading claim older than this is assumed abandoned: its request died. */
const STALE_CLAIM_MS = 3 * 60 * 1000;

/**
 * How long a generation claim is trusted before somebody else may take it on.
 *
 * Comfortably longer than the provider timeout — a request that is going to
 * answer has answered by then, so a claim older than this is held by nobody.
 * Deliberately much shorter than the grading lease above: a learner watching a
 * "building your exercises" screen is watching it *now*, and leaving them in
 * front of a claim nobody holds for three minutes would be the same freeze this
 * whole change exists to remove.
 */
const STALE_GENERATION_MS = 75 * 1000;

/** Postgres's unique violation. Two callers reached the same partial index. */
const UNIQUE_VIOLATION = "23505";

export type PracticeSessionDetail = {
  session: MistakePracticeSessionRow;
  /** In position order, 1 to 5. */
  items: MistakePracticeItemRow[];
};

export type OpenedSession = {
  session: MistakePracticeSessionRow;
  /** False when this tap joined a session that already existed for the target. */
  created: boolean;
};

/**
 * Opens a session for a target, or hands back the one already open for it.
 *
 * No provider call happens here, and that is the point of the whole iteration.
 * The tap creates a row and returns an id, the learner lands on a screen, and
 * the screen asks for the exercises. Fifteen seconds of waiting is the same
 * fifteen seconds either way; the difference is whether it is spent looking at
 * a button that has not moved.
 *
 * The partial unique index on (user_id, target_type, target_key) where the
 * status is `generating` is still what makes a double tap harmless: two taps
 * race to insert, one wins, and the loser is handed the same session rather
 * than a second one. Which of them ends up paying for the provider call is
 * decided separately, by `claimGenerationWork`.
 */
export async function openGenerationSession({
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
}): Promise<OpenedSession> {
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

  if (inserted) return { session: inserted, created: true };

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
    return openGenerationSession({ userId, userLanguageId, target, model, now });
  }

  return { session: existing, created: false };
}

export type WorkClaim =
  /** This caller owns the provider call and must finish or fail it. */
  | { status: "claimed"; session: MistakePracticeSessionRow }
  /** Somebody else is mid-call for this session right now. */
  | { status: "in_flight"; session: MistakePracticeSessionRow }
  /** The session is not owed a set: it is ready, graded, or failed. */
  | { status: "settled"; session: MistakePracticeSessionRow }
  /** Not this user's session, or no such session. */
  | { status: "unavailable" };

/**
 * Takes on the provider call for a session, or explains who has it.
 *
 * The conditional update *is* the lock. Two screens open on the same session
 * both try; the first stamps `generation_claimed_at` and no longer matches for
 * the second, which is told to wait and poll. A claim older than the lease is
 * held by a request that is gone, and taking it over is what stops a learner
 * being marooned in front of a set nobody is building.
 */
export async function claimGenerationWork({
  sessionId,
  userId,
  model,
  now = new Date(),
}: {
  sessionId: string;
  userId: string;
  model: string;
  now?: Date;
}): Promise<WorkClaim> {
  const [claimed] = await db
    .update(mistakePracticeSessions)
    .set({ generationClaimedAt: now, model, failureReason: null, updatedAt: now })
    .where(
      and(
        eq(mistakePracticeSessions.id, sessionId),
        eq(mistakePracticeSessions.userId, userId),
        eq(mistakePracticeSessions.status, "generating"),
        or(
          isNull(mistakePracticeSessions.generationClaimedAt),
          lt(
            mistakePracticeSessions.generationClaimedAt,
            new Date(now.getTime() - STALE_GENERATION_MS),
          ),
        ),
      ),
    )
    .returning();

  if (claimed) return { status: "claimed", session: claimed };

  const [existing] = await db
    .select()
    .from(mistakePracticeSessions)
    .where(
      and(eq(mistakePracticeSessions.id, sessionId), eq(mistakePracticeSessions.userId, userId)),
    )
    .limit(1);

  if (!existing) return { status: "unavailable" };
  return existing.status === "generating"
    ? { status: "in_flight", session: existing }
    : { status: "settled", session: existing };
}

/**
 * Puts a failed session back in the queue for a fresh attempt, in place.
 *
 * The same row, deliberately: a retry must never leave a second session behind,
 * and the learner is looking at a URL that has to keep working. The status we
 * read is the lock, so two taps reopen it once.
 *
 * It only moves the row back to `generating` with no work claim on it — the
 * provider call itself is taken on afterwards, by whoever is looking at the
 * screen, exactly as a first attempt is. One path, not two.
 *
 * The partial unique index can still refuse this, when another session for the
 * same target is already waiting for a set. That is not an error; it is the
 * answer "there is already one of these", and it is reported as such.
 */
export type ReopenResult =
  | { status: "reopened"; session: MistakePracticeSessionRow }
  /** Nothing to reopen: it is already waiting, ready or graded. */
  | { status: "unchanged"; session: MistakePracticeSessionRow };

export async function reopenGeneration({
  sessionId,
  userId,
  now = new Date(),
}: {
  sessionId: string;
  userId: string;
  now?: Date;
}): Promise<ReopenResult | null> {
  const [session] = await db
    .select()
    .from(mistakePracticeSessions)
    .where(
      and(eq(mistakePracticeSessions.id, sessionId), eq(mistakePracticeSessions.userId, userId)),
    )
    .limit(1);

  if (!session) return null;
  if (session.status !== "failed") return { status: "unchanged", session };

  try {
    const [reopened] = await db
      .update(mistakePracticeSessions)
      .set({
        status: "generating",
        generationClaimedAt: null,
        failureReason: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(mistakePracticeSessions.id, session.id),
          eq(mistakePracticeSessions.status, "failed"),
        ),
      )
      .returning();

    return reopened ? { status: "reopened", session: reopened } : { status: "unchanged", session };
  } catch (error) {
    // Another session for this target is already waiting for a set.
    if (isUniqueViolation(error)) return { status: "unchanged", session };
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
        generationClaimedAt: null,
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
    .set({
      status: "failed",
      // Releasing the claim with the failure keeps the two facts together: no
      // request is in flight, and there is nothing to wait for.
      generationClaimedAt: null,
      failureReason: reason,
      updatedAt: now,
    })
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

export type OpenPractice = {
  sessionId: string;
  targetType: MistakePracticeSessionRow["targetType"];
  targetKey: string;
  /** `generating`, `ready` or `failed` — the three a learner can act on. */
  status: MistakePracticeSessionRow["status"];
  /** How many of the five already have an answer saved. Zero while building. */
  answered: number;
};

/**
 * The set the learner has open, if there is one.
 *
 * A Mini App gets closed mid-exercise all the time — a message arrives, the
 * phone locks — and without this the work would simply be gone from view,
 * sitting in a table nothing links to. Three states qualify, because all three
 * are things somebody would want to get back to: one still being built, one part
 * answered, and one whose build failed and can be retried.
 *
 * A `ready` set nobody has touched is deliberately excluded. Nobody remembers
 * starting it, and offering to "continue" it would be confusing. A `generating`
 * one is included even with nothing answered, because it is the state a learner
 * most needs a way back into: they tapped, they left, and the app should still
 * know what it owes them.
 *
 * Scoped twice over, exactly like recent writing and recent speaking: to the
 * account, and to the language currently being studied.
 */
export async function getOpenPractice({
  userId,
  userLanguageId,
}: {
  userId: string;
  userLanguageId: string;
}): Promise<OpenPractice | null> {
  const answered = sql<number>`count(${mistakePracticeItems.id})::int`;

  const [row] = await db
    .select({
      sessionId: mistakePracticeSessions.id,
      targetType: mistakePracticeSessions.targetType,
      targetKey: mistakePracticeSessions.targetKey,
      status: mistakePracticeSessions.status,
      answered,
    })
    .from(mistakePracticeSessions)
    /**
     * A left join, so a session with no items yet — one still being built —
     * still comes back. The inner join this used to be is exactly what would
     * have hidden it.
     */
    .leftJoin(
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
        inArray(mistakePracticeSessions.status, ["generating", "ready", "failed"]),
      ),
    )
    .groupBy(
      mistakePracticeSessions.id,
      mistakePracticeSessions.targetType,
      mistakePracticeSessions.targetKey,
      mistakePracticeSessions.status,
      mistakePracticeSessions.createdAt,
    )
    // A ready set with nothing in it is not something anybody left half-done.
    .having(sql`${mistakePracticeSessions.status} <> 'ready' or ${answered} > 0`)
    .orderBy(desc(mistakePracticeSessions.createdAt))
    .limit(1);

  return row ?? null;
}

/** Only used by tests, to age a generation claim without waiting the lease out. */
export async function ageGenerationClaimForTesting(
  sessionId: string,
  claimedAt: Date,
): Promise<void> {
  await db
    .update(mistakePracticeSessions)
    .set({ generationClaimedAt: claimedAt })
    .where(eq(mistakePracticeSessions.id, sessionId));
}

/** Only used by tests, to age a grading claim without waiting three minutes. */
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
