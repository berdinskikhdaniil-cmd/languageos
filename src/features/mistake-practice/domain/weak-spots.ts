import {
  repeatedMistakes,
  weakPointsByCategory,
  type MistakeSelection,
} from "@/features/mistakes/domain/aggregate";
import type { MistakeOccurrence } from "@/features/mistakes/domain/occurrence";

/**
 * Which weak points Practice offers to drill, and in what order.
 *
 * The mistake engine already knows how to count; this only chooses. Two rules,
 * in order of how useful the answer is to a learner standing in front of it:
 *
 * A repeated skill first. "Past tense, four mistakes" names something specific
 * enough to build an exercise around, and it has already cleared the engine's
 * own threshold of two occurrences — "repeated" is a claim, and one mistake
 * does not support it.
 *
 * A category second, and only to fill the list. "Grammar, three mistakes" is
 * vaguer, and exercises built from it are vaguer too, but it is a real weak
 * point read off real work and it beats an empty section for somebody whose
 * reviews never named a skill twice.
 *
 * Improvement suggestions never appear. A note that a sentence was wordy is not
 * a mistake and a drill built on one would teach that a matter of taste was an
 * error — the same rule that governs every headline figure on Progress.
 */

/** Three. A short list somebody reads, not a menu they have to work through. */
export const MAX_WEAK_SPOTS = 3;

export type WeakSpot = {
  target: MistakeSelection;
  /** Concrete mistakes only. The number shown beside it. */
  mistakes: number;
  /**
   * The skill label as some review stored it, most recent spelling. Null for a
   * category, which is named from the dictionary instead.
   */
  label: string | null;
};

export function selectWeakSpots(
  occurrences: readonly MistakeOccurrence[],
  limit = MAX_WEAK_SPOTS,
): WeakSpot[] {
  const spots: WeakSpot[] = [];

  for (const skill of repeatedMistakes(occurrences)) {
    if (spots.length >= limit) return spots;
    spots.push({
      target: { kind: "skill", key: skill.key },
      mistakes: skill.mistakes,
      label: skill.label,
    });
  }

  for (const category of weakPointsByCategory(occurrences)) {
    if (spots.length >= limit) return spots;
    // A category whose findings are all stylistic has nothing concrete to
    // practise, and offering it would misrepresent what is in it.
    if (category.mistakes === 0) continue;

    spots.push({
      target: { kind: "category", category: category.category },
      mistakes: category.mistakes,
      label: null,
    });
  }

  return spots;
}
