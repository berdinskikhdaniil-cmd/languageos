"use server";

import { revalidatePath } from "next/cache";
import {
  OnboardingIncompleteError,
  getCurrentUser,
  requireOnboarded,
  type OnboardedUser,
} from "@/lib/auth/current-user";
import type { AppErrorCode } from "@/lib/errors";
import type { SpeakingFailureKey } from "@/lib/i18n/messages";
import { getSpeakingAttempt } from "./data/attempts";
import { runSpeakingReview } from "./data/review-runner";
import { speakingReviewFailureKey } from "./domain/failures";

/**
 * Reviewing a spoken answer that has already been transcribed.
 *
 * Deliberately the only server action Speaking has. The recording goes through
 * a route handler because it is binary; everything after it is ordinary work on
 * rows that already exist, and an action is the simpler way to do that.
 *
 * Called twice in normal life: once by the client the moment an upload comes
 * back with a transcript, and again by the retry button if that first attempt
 * failed. Both paths are the same call, because the runner is idempotent —
 * a completed review is returned, not redone.
 */

export type SpeakingActionResult =
  | { ok: true }
  | { ok: false; code: AppErrorCode }
  | { ok: false; failure: SpeakingFailureKey };

class SignedOutError extends Error {}

async function requireUser(): Promise<OnboardedUser> {
  const user = await getCurrentUser();
  if (!user) throw new SignedOutError();
  return requireOnboarded(user);
}

export async function reviewSpeakingAttemptAction(
  attemptId: string,
): Promise<SpeakingActionResult> {
  try {
    const user = await requireUser();

    const detail = await getSpeakingAttempt(attemptId, user.id);
    // Not found and not yours are the same answer, on purpose.
    if (!detail) return { ok: false, code: "SPEAKING_ATTEMPT_NOT_FOUND" };

    const outcome = await runSpeakingReview({ attempt: detail.attempt, user });
    if (!outcome.ok) return { ok: false, failure: speakingReviewFailureKey(outcome.reason) };
  } catch (error) {
    if (error instanceof SignedOutError) return { ok: false, code: "AUTH_EXPIRED" };
    if (error instanceof OnboardingIncompleteError) {
      return { ok: false, code: "ONBOARDING_REQUIRED" };
    }
    console.error("[speaking]", error);
    return { ok: false, code: "SPEAKING_REVIEW_FAILED" };
  }

  revalidatePath(`/practice/speaking/${attemptId}`);
  // The dashboard now has time on it that it did not have a moment ago.
  revalidatePath("/");
  revalidatePath("/practice");
  return { ok: true };
}
