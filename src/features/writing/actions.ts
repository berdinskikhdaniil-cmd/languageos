"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  OnboardingIncompleteError,
  getCurrentUser,
  requireOnboarded,
  type OnboardedUser,
} from "@/lib/auth/current-user";
import { createWritingEntry, getWritingEntry, saveRewrite } from "./data/entries";
import { runReview } from "./data/review-runner";
import { reviewFailureMessage } from "./domain/failures";
import { isWritingType, validateWritingText } from "./domain/writing-entry";

/**
 * Everything writing can change.
 *
 * Two rules run through all of it. The learner's text is saved before the
 * provider is ever called, so nothing downstream can lose a draft. And no
 * action accepts a user id, a language id or an unvalidated text — an entry id
 * is the only thing a client sends, and it is always looked up together with
 * its owner.
 */

export type WritingActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: string };

const SIGNED_OUT = "Your session has expired. Reopen the app from Telegram.";
const NOT_SET_UP = "Finish setting up your language before writing.";
const NOT_FOUND = "That writing could not be found.";

class SignedOutError extends Error {}

async function requireUser(): Promise<OnboardedUser> {
  const user = await getCurrentUser();
  if (!user) throw new SignedOutError(SIGNED_OUT);
  return requireOnboarded(user);
}

function toResult(error: unknown, fallback: string): WritingActionResult {
  if (error instanceof SignedOutError) return { ok: false, error: SIGNED_OUT };
  if (error instanceof OnboardingIncompleteError) return { ok: false, error: NOT_SET_UP };
  console.error("[writing]", error);
  return { ok: false, error: fallback };
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
      return { ok: false, error: "Choose what kind of writing this is.", field: "type" };
    }

    const validated = validateWritingText(input.text, user.primaryLanguage.code);
    if (!validated.ok) {
      return { ok: false, error: validated.message, field: validated.field };
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
    return toResult(error, "Could not save your writing. Try again.");
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
    if (!detail) return { ok: false, error: NOT_FOUND };

    const outcome = await runReview({ entry: detail.entry, user });
    if (!outcome.ok) return { ok: false, error: reviewFailureMessage(outcome.reason) };
  } catch (error) {
    return toResult(error, "Could not review your writing. Try again.");
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
    if (!validated.ok) return { ok: false, error: validated.message, field: validated.field };

    const saved = await saveRewrite({
      entryId: input.entryId,
      userId: user.id,
      revisedText: validated.value.text,
    });

    if (!saved) return { ok: false, error: NOT_FOUND };
  } catch (error) {
    return toResult(error, "Could not save your rewrite. Try again.");
  }

  revalidatePath(`/practice/writing/${input.entryId}`);
  return { ok: true };
}
