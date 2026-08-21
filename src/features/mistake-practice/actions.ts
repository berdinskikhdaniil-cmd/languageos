"use server";

import { revalidatePath } from "next/cache";
import {
  OnboardingIncompleteError,
  getCurrentUser,
  requireOnboarded,
  type OnboardedUser,
} from "@/lib/auth/current-user";
import type { AppErrorCode } from "@/lib/errors";
import type { PracticeFailureKey } from "@/lib/i18n/messages";
import { runGrading } from "./data/grading-runner";
import { generatePendingExercises, openPracticeSession } from "./data/generation-runner";
import { getPracticeSession, reopenGeneration, saveAnswer } from "./data/sessions";
import type { MistakePracticeSessionRow } from "@/db/schema";
import { EXERCISE_COUNT } from "./domain/exercise";
import { generationFailureKey, gradingFailureKey } from "./domain/failures";
import { fromStoredTarget, practiceSessionHref } from "./domain/target";

/**
 * Everything targeted practice can change.
 *
 * Three rules run through all of it. No action accepts a user id or a language
 * id — a session id and a weak point are the only things a client sends, and
 * both are resolved against the authenticated user before anything happens. A
 * weak point is re-proved against the learner's real mistakes rather than taken
 * on trust, because "you keep getting this wrong" is a claim the client is not
 * allowed to make. And an answer, once typed, is saved before anything
 * expensive is attempted, so no provider failure can cost somebody their work.
 *
 * Failures come back as codes. A generation or a check that did not happen has
 * its own set of reasons, so it reports a `failure` key instead — the two are
 * different kinds of thing and the screen words them differently.
 */

export type PracticeActionResult =
  | { ok: true }
  | { ok: false; code: AppErrorCode }
  | { ok: false; failure: PracticeFailureKey };

export type PracticeSessionStatus = MistakePracticeSessionRow["status"];

export type StartPracticeResult =
  | { ok: true; sessionId: string }
  | { ok: false; code: AppErrorCode }
  | { ok: false; failure: PracticeFailureKey };

class SignedOutError extends Error {}

async function requireUser(): Promise<OnboardedUser> {
  const user = await getCurrentUser();
  if (!user) throw new SignedOutError();
  return requireOnboarded(user);
}

function toResult(error: unknown, fallback: AppErrorCode): { ok: false; code: AppErrorCode } {
  if (error instanceof SignedOutError) return { ok: false, code: "AUTH_EXPIRED" };
  if (error instanceof OnboardingIncompleteError) {
    return { ok: false, code: "ONBOARDING_REQUIRED" };
  }
  console.error("[mistake-practice]", error);
  return { ok: false, code: fallback };
}

/**
 * Opens a session for a weak point and says where to find it. Nothing more.
 *
 * This used to build the exercises too, and took about fifteen seconds doing
 * it — fifteen seconds in which the learner watched a button that had not
 * changed and concluded the app was broken. It now does only the cheap half:
 * prove the weak point is real, create the row, hand back the id. The screen at
 * that id is what asks for the exercises.
 *
 * The target arrives as the two strings a link carries. It is parsed, then
 * checked against the learner's own reviews; a weak point they do not have
 * produces no row and no provider call.
 */
export async function startMistakePracticeAction(input: {
  targetType: unknown;
  targetKey: unknown;
}): Promise<StartPracticeResult> {
  try {
    const user = await requireUser();

    const selection = fromStoredTarget(
      typeof input.targetType === "string" ? input.targetType : null,
      typeof input.targetKey === "string" ? input.targetKey : null,
    );
    if (!selection) return { ok: false, code: "PRACTICE_TARGET_UNKNOWN" };

    const outcome = await openPracticeSession({ user, selection });
    if (!outcome.ok) return { ok: false, failure: generationFailureKey(outcome.reason) };

    revalidatePath("/practice");
    return { ok: true, sessionId: outcome.sessionId };
  } catch (error) {
    return toResult(error, "PRACTICE_START_FAILED");
  }
}

/**
 * Asks for the exercises a session is waiting for.
 *
 * Called by the generating screen the moment it mounts, on a first visit and on
 * every reopen alike. It is deliberately safe to call unconditionally: a set
 * that already exists costs nothing, a set somebody else is mid-call on is
 * reported as such, and only a genuinely unclaimed one is taken on. The client
 * never has to reason about whether a provider call is already out.
 */
export async function generatePracticeExercisesAction(
  sessionId: string,
): Promise<PracticeActionResult> {
  try {
    const user = await requireUser();

    const outcome = await generatePendingExercises({ user, sessionId });
    if (!outcome.ok) {
      if (outcome.reason === "unavailable") {
        return { ok: false, code: "PRACTICE_SESSION_NOT_FOUND" };
      }
      revalidatePath(practiceSessionHref(sessionId));
      return { ok: false, failure: generationFailureKey(outcome.reason) };
    }
  } catch (error) {
    return toResult(error, "PRACTICE_START_FAILED");
  }

  revalidatePath(practiceSessionHref(sessionId));
  return { ok: true };
}

/**
 * Puts a failed session back in the queue, in the same row.
 *
 * It only reopens; the screen then asks for the exercises through the same
 * action a first attempt uses. One path rather than two, so a retry cannot
 * quietly behave differently from the thing it is retrying.
 */
export async function retryPracticeGenerationAction(
  sessionId: string,
): Promise<PracticeActionResult> {
  try {
    const user = await requireUser();

    const outcome = await reopenGeneration({ sessionId, userId: user.id });
    // Not found and not yours are the same answer, on purpose.
    if (!outcome) return { ok: false, code: "PRACTICE_SESSION_NOT_FOUND" };
  } catch (error) {
    return toResult(error, "PRACTICE_START_FAILED");
  }

  revalidatePath(practiceSessionHref(sessionId));
  return { ok: true };
}

/**
 * Where a session has got to, and nothing else.
 *
 * The generating screen polls this while it waits, because the request that is
 * actually building the set may not be the one the learner is looking at — they
 * may have closed the Mini App and come back, or double-tapped and landed with
 * the loser. One small read, so polling it every couple of seconds costs
 * roughly nothing.
 */
export async function practiceSessionStatusAction(
  sessionId: string,
): Promise<{ status: PracticeSessionStatus } | null> {
  try {
    const user = await requireUser();

    const detail = await getPracticeSession(sessionId, user.id);
    return detail ? { status: detail.session.status } : null;
  } catch (error) {
    // A poll that could not read is not worth an error on screen; the next one
    // will answer, and the caller treats null as "still waiting".
    console.error("[mistake-practice] status poll failed", error);
    return null;
  }
}

/**
 * Saves one answer, as the learner moves through the set.
 *
 * Called on every step forward and back, so a Mini App that is closed halfway
 * leaves work behind rather than nothing. The write is refused once the set has
 * been checked — a graded session's answers are what the verdicts are about, and
 * letting a stale tab edit one would put the two out of step.
 */
export async function savePracticeAnswerAction(input: {
  sessionId: string;
  position: unknown;
  answer: unknown;
}): Promise<PracticeActionResult> {
  try {
    const user = await requireUser();

    const position = input.position;
    if (typeof position !== "number" || !Number.isInteger(position)) {
      return { ok: false, code: "PRACTICE_SESSION_NOT_FOUND" };
    }

    const saved = await saveAnswer({
      sessionId: input.sessionId,
      userId: user.id,
      position,
      answer: input.answer,
    });
    if (!saved) return { ok: false, code: "PRACTICE_SESSION_NOT_FOUND" };
  } catch (error) {
    return toResult(error, "PRACTICE_SAVE_FAILED");
  }

  return { ok: true };
}

/**
 * Saves every answer, then checks the set — one provider call for all five.
 *
 * The answers are written first and separately, so a check that never comes
 * back costs a retry and nothing else. The completeness rule is decided from
 * the rows afterwards, in the runner, rather than from what arrived here.
 */
export async function gradePracticeSessionAction(input: {
  sessionId: string;
  answers: unknown;
}): Promise<PracticeActionResult> {
  try {
    const user = await requireUser();

    const detail = await getPracticeSession(input.sessionId, user.id);
    if (!detail) return { ok: false, code: "PRACTICE_SESSION_NOT_FOUND" };

    if (Array.isArray(input.answers)) {
      for (const entry of input.answers.slice(0, EXERCISE_COUNT)) {
        if (typeof entry !== "object" || entry === null) continue;
        const { position, answer } = entry as { position?: unknown; answer?: unknown };
        if (typeof position !== "number" || !Number.isInteger(position)) continue;

        await saveAnswer({
          sessionId: input.sessionId,
          userId: user.id,
          position,
          answer,
        });
      }
    }

    const outcome = await runGrading({ user, sessionId: input.sessionId });
    if (!outcome.ok) {
      revalidatePath(practiceSessionHref(input.sessionId));
      return { ok: false, failure: gradingFailureKey(outcome.reason) };
    }
  } catch (error) {
    return toResult(error, "PRACTICE_GRADE_FAILED");
  }

  revalidatePath(practiceSessionHref(input.sessionId));
  revalidatePath("/practice");
  return { ok: true };
}
