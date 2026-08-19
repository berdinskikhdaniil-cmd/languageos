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
import { retryGeneration, runGeneration } from "./data/generation-runner";
import { getPracticeSession, saveAnswer } from "./data/sessions";
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
 * Builds a set of exercises for a weak point, and says where to find it.
 *
 * The target arrives as the two strings a link carries. It is parsed, then
 * checked against the learner's own reviews; a weak point they do not have
 * produces no row and no provider call.
 *
 * A session that exists is always worth opening, even when its generation
 * failed — the screen there reads the truth from the database and offers the
 * button again, which is a better place to be than back where you tapped.
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

    const outcome = await runGeneration({ user, selection });

    if (!outcome.ok && outcome.sessionId === null) {
      // Nothing was created: the weak point is not theirs, or the installation
      // has no provider. There is no screen to send them to.
      return { ok: false, failure: generationFailureKey(outcome.reason) };
    }

    /**
     * A session that exists is worth opening even when its generation failed.
     * The screen reads the truth from the database and offers the button again,
     * which is a better place to be than back where they tapped.
     */
    const sessionId = outcome.ok ? outcome.sessionId : (outcome.sessionId as string);
    revalidatePath(practiceSessionHref(sessionId));
    revalidatePath("/practice");
    return { ok: true, sessionId };
  } catch (error) {
    return toResult(error, "PRACTICE_START_FAILED");
  }
}

/** Asks for a failed session's exercises again, in the same session. */
export async function retryPracticeGenerationAction(
  sessionId: string,
): Promise<PracticeActionResult> {
  try {
    const user = await requireUser();

    const outcome = await retryGeneration({ user, sessionId });
    // Not found and not yours are the same answer, on purpose.
    if (!outcome) return { ok: false, code: "PRACTICE_SESSION_NOT_FOUND" };
    if (!outcome.ok) return { ok: false, failure: generationFailureKey(outcome.reason) };
  } catch (error) {
    return toResult(error, "PRACTICE_START_FAILED");
  }

  revalidatePath(practiceSessionHref(sessionId));
  return { ok: true };
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
