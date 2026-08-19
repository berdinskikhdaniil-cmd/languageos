import type { AppErrorCode } from "@/lib/errors";
import { countWords } from "./word-count";

/**
 * What a submission has to be before it costs anything.
 *
 * The limits are here, in one place, because they are the product's only
 * defence against an expensive request: there is no billing, no quota system
 * and no per-token accounting yet. The maximum is mirrored by a CHECK
 * constraint on the column, so a code path that forgets to validate still
 * cannot store a novel.
 */

export const WRITING_TYPES = ["free_writing", "retelling"] as const;

export type WritingType = (typeof WRITING_TYPES)[number];

/**
 * Long enough that a review has something to say; short enough that a stray tap
 * does not spend a request. Roughly a sentence.
 */
export const MIN_WRITING_CHARS = 40;

/**
 * About 1000 words of Latin script — more than anyone drafts on a phone, and
 * far below anything that would make a single request expensive. Kept in step
 * with `writing_entries_original_text_length` by hand; changing one without the
 * other is a bug.
 */
export const MAX_WRITING_CHARS = 6000;

/**
 * How many pieces of writing one learner may have reviewed in a day.
 *
 * The whole of the cost boundary, and deliberately crude: there are no
 * subscriptions, no quotas and no billing yet, so this exists only to keep a
 * single account from running up a provider bill. Retrying a failed review
 * reuses its row and does not count again.
 *
 * Read at call time so a self-hoster can raise or lower it without a rebuild.
 */
const DEFAULT_DAILY_REVIEW_LIMIT = 20;

export function dailyReviewLimit(): number {
  const raw = Number(process.env.WRITING_DAILY_REVIEW_LIMIT);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_DAILY_REVIEW_LIMIT;
}

export function isWritingType(value: unknown): value is WritingType {
  return typeof value === "string" && (WRITING_TYPES as readonly string[]).includes(value);
}

export type WritingTextField = "text" | "type";

export type WritingTextResult =
  | { ok: true; value: { text: string; wordCount: number } }
  | { ok: false; field: WritingTextField; code: AppErrorCode };

/**
 * Validates and normalises a submission.
 *
 * Trailing whitespace is trimmed — a text box collects plenty — but nothing
 * inside the text is touched: paragraph breaks are the learner's, and the
 * stored text has to match the fragments a review will quote from it.
 */
export function validateWritingText(
  raw: unknown,
  locale?: string,
): WritingTextResult {
  if (typeof raw !== "string") {
    return { ok: false, field: "text", code: "WRITING_TEXT_REQUIRED" };
  }

  const text = raw.trim();

  if (text.length < MIN_WRITING_CHARS) {
    return { ok: false, field: "text", code: "WRITING_TOO_SHORT" };
  }

  if (text.length > MAX_WRITING_CHARS) {
    return { ok: false, field: "text", code: "WRITING_TOO_LONG" };
  }

  return { ok: true, value: { text, wordCount: countWords(text, locale) } };
}
