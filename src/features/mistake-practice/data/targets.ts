import { occurrencesFor, type MistakeSelection } from "@/features/mistakes/domain/aggregate";
import { loadMistakeWorkload } from "@/features/mistakes/data/mistakes";
import { isConcreteMistake, type MistakeOccurrence } from "@/features/mistakes/domain/occurrence";
import type { OnboardedUser } from "@/lib/auth/current-user";
import { addLocalDays, startOfLocalDay } from "@/lib/time";
import { selectWeakSpots, type WeakSpot } from "../domain/weak-spots";

/**
 * Whether a weak point is really this learner's, answered from the database.
 *
 * This is the security boundary of the whole feature, and it is not about ids.
 * A practice target is a *claim* — "you keep getting the past tense wrong" — and
 * the client is not allowed to make it. Whatever arrives from a form field is
 * re-derived here from the authenticated user's own reviews, in the language
 * they are currently studying, and a target with nothing concrete behind it is
 * refused. Nobody gets to generate exercises about a skill they have never got
 * wrong, and nobody gets to have another account's mistakes read on their behalf.
 *
 * Everything below reads `writing_issues` and `speaking_issues` through the
 * mistake engine and writes to neither. Practising does not edit history.
 */

/**
 * How far back the Practice hub looks for something to offer.
 *
 * Bounded, because this runs on a screen somebody opens constantly and the
 * engine aggregates in the domain layer rather than in SQL. Ninety days is the
 * longest window Progress draws a comparison over, and a weak point older than
 * that is not what somebody needs to drill this afternoon.
 */
export const WEAK_SPOT_WINDOW_DAYS = 90;

export type ResolvedTarget = {
  selection: MistakeSelection;
  /** Concrete mistakes filed under this weak point, newest first. */
  occurrences: MistakeOccurrence[];
  /**
   * What to call it *to the model*: the canonical English skill label, or the
   * category identifier. Never a translation — the stored taxonomy is English
   * whatever the interface says.
   */
  name: string;
  /** The stored spelling of a skill label, for the screen's own fallback. */
  label: string | null;
};

/**
 * The target, if the learner actually has it. Null otherwise.
 *
 * All of time, deliberately, where the hub looks at ninety days: somebody who
 * opens a weak point on Progress with the period set to "all" and taps Practise
 * should get exercises, and a mistake does not stop having been made because it
 * was six months ago. The window on the hub is about what to *offer*; this is
 * about what to *allow*.
 */
export async function resolvePracticeTarget(
  user: OnboardedUser,
  selection: MistakeSelection,
): Promise<ResolvedTarget | null> {
  const workload = await loadMistakeWorkload({
    userId: user.id,
    userLanguageId: user.primaryLanguage.id,
    languageCode: user.primaryLanguage.code,
    from: null,
  });

  const occurrences = occurrencesFor(workload.occurrences, selection).filter(isConcreteMistake);
  // A weak point with only stylistic notes behind it is not a weak point, and
  // exercises built on one would teach that a matter of taste was an error.
  if (occurrences.length === 0) return null;

  const label =
    selection.kind === "skill"
      ? (occurrences.find((occurrence) => occurrence.label !== null)?.label ?? null)
      : null;

  return {
    selection,
    occurrences,
    name: selection.kind === "category" ? selection.category : (label ?? selection.key),
    label,
  };
}

/**
 * The few weak points worth offering on the Practice hub.
 *
 * One read, then pure selection — the ordering rules live in
 * ../domain/weak-spots and are testable without a database.
 */
export async function loadWeakSpots(
  user: OnboardedUser,
  now = new Date(),
): Promise<WeakSpot[]> {
  const from = addLocalDays(
    startOfLocalDay(now, user.timeZone),
    -(WEAK_SPOT_WINDOW_DAYS - 1),
    user.timeZone,
  );

  const workload = await loadMistakeWorkload({
    userId: user.id,
    userLanguageId: user.primaryLanguage.id,
    languageCode: user.primaryLanguage.code,
    from,
  });

  return selectWeakSpots(workload.occurrences);
}
