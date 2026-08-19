"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  OnboardingIncompleteError,
  getCurrentUser,
  requireOnboarded,
  type OnboardedUser,
} from "@/lib/auth/current-user";
import type { AppErrorCode } from "@/lib/errors";
import type { ReviewFailureKey } from "@/lib/i18n/messages";
import { createWritingEntry, getWritingEntry, saveRewrite } from "./data/entries";
import { runReview } from "./data/review-runner";
import { reviewFailureKey } from "./domain/failures";
import { isWritingType, validateWritingText } from "./domain/writing-entry";

/**
 * Everything writing can change.
 *
 * Two rules run through all of it. The learner's text is saved before the
 * provider is ever called, so nothing downstream can lose a draft. And no
 * action accepts a user id, a language id or an unvalidated text — an entry id
 * is the only thing a client sends, and it is always looked up together with
 * its owner.
 *
 * Failures come back as codes. A review that did not happen has its own set of
 * reasons, so it reports a `failure` key instead — the two are different kinds
 * of thing and the screen words them differently.
 */

export type WritingActionResult =
  | { ok: true }
  | { ok: false; code: AppErrorCode; field?: string }
  | { ok: false; failure: ReviewFailureKey };

class SignedOutError extends Error {}

async function requireUser(): Promise<OnboardedUser> {
  const user = await getCurrentUser();
  if (!user) throw new SignedOutError();
  return requireOnboarded(user);
}

function toResult(error: unknown, fallback: AppErrorCode): WritingActionResult {
  if (error instanceof SignedOutError) return { ok: false, code: "AUTH_EXPIRED" };
  if (error instanceof OnboardingIncompleteError) {
    return { ok: false, code: "ONBOARDING_REQUIRED" };
  }
  console.error("[writing]", error);
  return { ok: false, code: fallback };
}

/**
 * Saves a submission, then reviews it.
 *
 * The redirect happens whatever the review did: a learner whose provider timed
 * out still lands on their saved writing with a button to try again, rather
 * than back in an editor wondering whether anything was kept. The page reads
 * the outcome from the database, so nothing has to survive the redirect.
 */
export async function submitWritingAction(input: {
  type: unknown;
  text: unknown;
}): Promise<WritingActionResult> {
  let entryId: string;

  try {
    const user = await requireUser();

    if (!isWritingType(input.type)) {
      return { ok: false, code: "WRITING_TYPE_REQUIRED", field: "type" };
    }

    const validated = validateWritingText(input.text, user.primaryLanguage.code);
    if (!validated.ok) {
      return { ok: false, code: validated.code, field: validated.field };
    }

    // Saved first, always. Everything after this line can fail safely.
    const entry = await createWritingEntry({
      userId: user.id,
      userLanguageId: user.primaryLanguage.id,
      type: input.type,
      originalText: validated.value.text,
      wordCount: validated.value.wordCount,
    });
    entryId = entry.id;

    await runReview({ entry, user });
  } catch (error) {
    return toResult(error, "WRITING_SAVE_FAILED");
  }

  revalidatePath(`/practice/writing/${entryId}`);
  // Outside the try: redirect works by throwing, and catching it here would
  // report a failure for writing that was saved and reviewed.
  redirect(`/practice/writing/${entryId}`);
}

/**
 * Asks for the review again after a failure.
 *
 * Reuses the entry and its existing review row, so a retry never creates a
 * second entry, a second set of issues, or a second charge for work already
 * done.
 */
export async function retryReviewAction(entryId: string): Promise<WritingActionResult> {
  try {
    const user = await requireUser();

    const detail = await getWritingEntry(entryId, user.id);
    // Not found and not yours are the same answer, on purpose.
    if (!detail) return { ok: false, code: "WRITING_NOT_FOUND" };

    const outcome = await runReview({ entry: detail.entry, user });
    if (!outcome.ok) return { ok: false, failure: reviewFailureKey(outcome.reason) };
  } catch (error) {
    return toResult(error, "WRITING_REVIEW_FAILED");
  }

  revalidatePath(`/practice/writing/${entryId}`);
  return { ok: true };
}

/** Stores the learner's own corrected version, beside the original. */
export async function saveRewriteAction(input: {
  entryId: string;
  text: unknown;
}): Promise<WritingActionResult> {
  try {
    const user = await requireUser();

    const validated = validateWritingText(input.text, user.primaryLanguage.code);
    if (!validated.ok) return { ok: false, code: validated.code, field: validated.field };

    const saved = await saveRewrite({
      entryId: input.entryId,
      userId: user.id,
      revisedText: validated.value.text,
    });

    if (!saved) return { ok: false, code: "WRITING_NOT_FOUND" };
  } catch (error) {
    return toResult(error, "REWRITE_SAVE_FAILED");
  }

  revalidatePath(`/practice/writing/${input.entryId}`);
  return { ok: true };
}
