import { isCategory } from "@/features/writing/domain/review";
import type { MistakeSelection } from "@/features/mistakes/domain/aggregate";
import { normalizeLabel } from "@/features/mistakes/domain/label";

/**
 * What a practice session is about, and how that survives a round trip.
 *
 * There is no new taxonomy here. A practice target *is* a `MistakeSelection` —
 * the same category-or-skill pair the mistake engine already reasons in — and
 * this file only says how one is written to a column and read back out of a
 * form field. Introducing a second vocabulary for the same idea is exactly the
 * split the mistake engine exists to avoid.
 *
 * Two columns rather than one prefixed string: `target_type` is an enum the
 * database checks, and `target_key` holds the canonical value. A skill key is
 * the normalised English label; a category key is the category identifier. Both
 * stay canonical whatever language the interface is set to, for the same reason
 * `writing_issues.category` does.
 *
 * Nothing that arrives from a client is trusted here. This module turns strings
 * into a selection or into null, and the *existence* of that selection in the
 * learner's own mistakes is checked separately, against the database — see
 * ../data/targets.ts.
 */

export const PRACTICE_TARGET_TYPES = ["skill", "category"] as const;

export type PracticeTargetType = (typeof PRACTICE_TARGET_TYPES)[number];

/** How a selection is stored, and how it travels in a form field. */
export type StoredTarget = { type: PracticeTargetType; key: string };

export function toStoredTarget(selection: MistakeSelection): StoredTarget {
  return selection.kind === "category"
    ? { type: "category", key: selection.category }
    : { type: "skill", key: selection.key };
}

/**
 * A stored pair read back as a selection, or null when it is not one we know.
 *
 * Null is a real answer rather than a throw: the pair may have come out of a
 * row written by an older version, or out of a request somebody typed, and
 * neither is an exception — it is a session that cannot be rendered.
 *
 * A skill key is normalised again on the way in. It should already be
 * normalised, because that is what `toStoredTarget` writes, but normalisation
 * is this feature's only definition of "the same skill" and applying it twice
 * costs nothing.
 */
export function fromStoredTarget(
  type: string | null | undefined,
  key: string | null | undefined,
): MistakeSelection | null {
  if (typeof key !== "string") return null;

  if (type === "category") {
    return isCategory(key) ? { kind: "category", category: key } : null;
  }

  if (type === "skill") {
    const normalized = normalizeLabel(key);
    return normalized === null ? null : { kind: "skill", key: normalized };
  }

  return null;
}

export function isPracticeTargetType(value: unknown): value is PracticeTargetType {
  return (
    typeof value === "string" && (PRACTICE_TARGET_TYPES as readonly string[]).includes(value)
  );
}

/** Where a finished or abandoned session lives. Built in one place. */
export function practiceSessionHref(sessionId: string): string {
  return `/practice/mistakes/${sessionId}`;
}
