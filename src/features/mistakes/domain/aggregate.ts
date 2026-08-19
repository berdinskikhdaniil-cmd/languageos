import { ISSUE_CATEGORIES, type IssueCategory } from "@/features/writing/domain/review";
import { normalizeLabel } from "./label";
import {
  isConcreteMistake,
  sortOccurrences,
  type MistakeOccurrence,
  type MistakeSource,
} from "./occurrence";

/**
 * Counting mistakes.
 *
 * Everything here is pure and takes the occurrences it is given, so the rules
 * that decide what a learner is told — what counts as a mistake, what counts as
 * repeated, which weak point comes first — are testable without a database, a
 * clock or a browser. The queries that produce the occurrences are in ../data.
 *
 * One rule runs through all of it: a concrete mistake and an improvement
 * suggestion are never added into the same number. See `isConcreteMistake`.
 */

export type SeverityCounts = {
  /** severity `error`. The headline figure. */
  mistakes: number;
  /** `awkward` and `style` together. Never folded into the number above. */
  suggestions: number;
};

export function countSeverities(occurrences: readonly MistakeOccurrence[]): SeverityCounts {
  let mistakes = 0;

  for (const occurrence of occurrences) {
    if (isConcreteMistake(occurrence)) mistakes += 1;
  }

  return { mistakes, suggestions: occurrences.length - mistakes };
}

export type SourceBalance = Record<MistakeSource, number>;

export type CategoryWeakPoint = {
  category: IssueCategory;
  mistakes: number;
  suggestions: number;
  /** Both together — what the detail screen for this category will list. */
  total: number;
  /**
   * Which skill the concrete mistakes turned up in. Counted the same way the
   * headline figure and `balanceBySource` count, so the pair always adds up to
   * `mistakes` and a reader never has to do arithmetic to check.
   */
  bySource: SourceBalance;
};

/**
 * Where the mistakes are, by category, worst first.
 *
 * Both severities are reported and kept apart, because a category can be
 * entirely stylistic and the learner deserves to see that rather than a number
 * that implies twelve grammar errors. Sorting is by mistakes first: a category
 * with three real errors matters more than one with eight notes on wordiness.
 *
 * A category nobody has any findings in is left out. There are nine of them and
 * a column of zeroes is not information.
 */
export function weakPointsByCategory(
  occurrences: readonly MistakeOccurrence[],
): CategoryWeakPoint[] {
  const counts = new Map<
    IssueCategory,
    { mistakes: number; suggestions: number; bySource: SourceBalance }
  >();

  for (const occurrence of occurrences) {
    const entry = counts.get(occurrence.category) ?? {
      mistakes: 0,
      suggestions: 0,
      bySource: { writing: 0, speaking: 0 },
    };

    if (isConcreteMistake(occurrence)) {
      entry.mistakes += 1;
      entry.bySource[occurrence.source] += 1;
    } else {
      entry.suggestions += 1;
    }

    counts.set(occurrence.category, entry);
  }

  return [...counts.entries()]
    .map(([category, entry]) => ({
      category,
      mistakes: entry.mistakes,
      suggestions: entry.suggestions,
      total: entry.mistakes + entry.suggestions,
      bySource: entry.bySource,
    }))
    .sort(
      (a, b) =>
        b.mistakes - a.mistakes ||
        b.total - a.total ||
        // The canonical order, so equal counts never reshuffle between renders.
        ISSUE_CATEGORIES.indexOf(a.category) - ISSUE_CATEGORIES.indexOf(b.category),
    );
}

/** How many times a label has to appear before it is worth calling repeated. */
export const REPEATED_THRESHOLD = 2;

export type RepeatedMistake = {
  /** The normalised label — the grouping key, and what a URL carries. */
  key: string;
  /** The label as stored, most recent spelling, for a skill we have no name for. */
  label: string;
  /** Concrete mistakes only. This is the number shown, and the one thresholded. */
  mistakes: number;
  bySource: Record<MistakeSource, number>;
};

/**
 * The skills a learner keeps getting wrong.
 *
 * Concrete mistakes only, and that is the whole reason this block can be called
 * "repeated mistakes" honestly. A stylistic note that recurs is a habit, not a
 * mistake, and it is counted under its category instead.
 *
 * Two occurrences is the threshold, because one is not a pattern — and the copy
 * on screen would be a lie if it were. Labels group after normalisation and
 * never after interpretation: see ./label.
 */
export function repeatedMistakes(
  occurrences: readonly MistakeOccurrence[],
): RepeatedMistake[] {
  const groups = new Map<
    string,
    { label: string; latest: number; mistakes: number; bySource: Record<MistakeSource, number> }
  >();

  for (const occurrence of occurrences) {
    if (!isConcreteMistake(occurrence)) continue;

    const key = normalizeLabel(occurrence.label);
    // Nothing to name the skill with. It still counts towards its category.
    if (key === null || occurrence.label === null) continue;

    const time = occurrence.createdAt.getTime();
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        label: occurrence.label,
        latest: time,
        mistakes: 1,
        bySource: { writing: 0, speaking: 0 },
      });
    } else {
      existing.mistakes += 1;
      // The most recent spelling wins the fallback display, so a skill we have
      // no translation for reads the way the last review wrote it.
      if (time > existing.latest) {
        existing.latest = time;
        existing.label = occurrence.label;
      }
    }

    groups.get(key)!.bySource[occurrence.source] += 1;
  }

  return [...groups.entries()]
    .filter(([, group]) => group.mistakes >= REPEATED_THRESHOLD)
    .map(([key, group]) => ({
      key,
      label: group.label,
      mistakes: group.mistakes,
      bySource: group.bySource,
    }))
    .sort((a, b) => b.mistakes - a.mistakes || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * Which skill the mistakes are showing up in. Concrete mistakes only, so the
 * two numbers can be read next to the headline without arithmetic.
 */
export function balanceBySource(occurrences: readonly MistakeOccurrence[]): SourceBalance {
  const balance: SourceBalance = { writing: 0, speaking: 0 };

  for (const occurrence of occurrences) {
    if (isConcreteMistake(occurrence)) balance[occurrence.source] += 1;
  }

  return balance;
}

/** The last few concrete mistakes, newest first, whichever skill they came from. */
export function recentMistakes(
  occurrences: readonly MistakeOccurrence[],
  limit = 10,
): MistakeOccurrence[] {
  return sortOccurrences(occurrences.filter(isConcreteMistake)).slice(0, limit);
}

/**
 * Which weak point a screen is about.
 *
 * A category or a normalised skill label, and never both. Two kinds rather than
 * one string with a prefix, so nothing has to parse a key to know what it is.
 */
export type MistakeSelection =
  | { kind: "category"; category: IssueCategory }
  | { kind: "skill"; key: string };

/**
 * Everything filed under one weak point, newest first.
 *
 * Both severities, deliberately: this is the history of a weak point, and the
 * awkward phrasings belong to the story of an article problem even though they
 * are not counted as mistakes. Each occurrence carries its own severity, so the
 * screen can say which is which rather than blurring them into a total.
 */
export function occurrencesFor(
  occurrences: readonly MistakeOccurrence[],
  selection: MistakeSelection,
): MistakeOccurrence[] {
  const matches =
    selection.kind === "category"
      ? occurrences.filter((occurrence) => occurrence.category === selection.category)
      : occurrences.filter((occurrence) => normalizeLabel(occurrence.label) === selection.key);

  return sortOccurrences(matches);
}
