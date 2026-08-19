import {
  isConcreteMistake,
  sortOccurrences,
  type MistakeOccurrence,
  type MistakeSource,
} from "@/features/mistakes/domain/occurrence";
import type { IssueCategory } from "@/features/writing/domain/review";
import { comparisonKey } from "./exercise";

/**
 * Which of the learner's real mistakes are shown to the generator.
 *
 * The generator needs enough to recognise the *skill* and no more. It is not
 * being asked to correct these sentences again — they have already been
 * corrected, on the screen the learner came from — it is being asked what weak
 * point they demonstrate, so it can build fresh contexts that exercise it.
 *
 * Six at most, and six is generous. Sending a hundred occurrences would cost
 * tokens, bury the pattern in noise, and make it far likelier that the model
 * simply echoes one of them back as an exercise.
 */

export const MAX_SOURCE_EXAMPLES = 6;

/**
 * One grounding example, stripped to what the generator can use.
 *
 * Deliberately not the whole writing entry or transcript the mistake came
 * from. The surrounding text is the learner's own subject matter — what they
 * did at the weekend, who they live with — and none of it helps identify a
 * tense problem. The minimum personal context is the right amount of personal
 * context.
 */
export type SourceExample = {
  originalFragment: string;
  suggestion: string;
  explanation: string;
  category: IssueCategory;
  /** The model's own canonical English skill name, when it gave one. */
  label: string | null;
  source: MistakeSource;
};

/**
 * The most useful examples for one weak point, newest first.
 *
 * Three rules, in order. Only concrete mistakes: an `awkward` note is a
 * suggestion, and building a drill around one would teach the learner that a
 * matter of taste was an error. Only distinct fragments: the same sentence
 * three times is one example repeated, and repetition in the context is what
 * makes a model repeat it back. And recent first, because a weak point is a
 * thing somebody has *now*.
 */
export function selectSourceExamples(
  occurrences: readonly MistakeOccurrence[],
  limit = MAX_SOURCE_EXAMPLES,
): SourceExample[] {
  const seen = new Set<string>();
  const chosen: SourceExample[] = [];

  for (const occurrence of sortOccurrences(occurrences.filter(isConcreteMistake))) {
    const key = comparisonKey(occurrence.originalFragment);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);

    chosen.push({
      originalFragment: occurrence.originalFragment,
      suggestion: occurrence.suggestion,
      explanation: occurrence.explanation,
      category: occurrence.category,
      label: occurrence.label,
      source: occurrence.source,
    });

    if (chosen.length >= limit) break;
  }

  return chosen;
}
