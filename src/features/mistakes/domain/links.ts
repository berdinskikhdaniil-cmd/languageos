import { isCategory } from "@/features/writing/domain/review";
import type { MistakeSelection } from "./aggregate";
import { normalizeLabel } from "./label";
import { DEFAULT_MISTAKE_PERIOD, type MistakePeriod } from "./period";

/**
 * The two URLs the mistake engine owns, built in one place.
 *
 * The selected period travels in the query string rather than in the path, and
 * a skill key travels with it. A normalised label is still the model's own
 * words — it can hold a slash, a bracket or an apostrophe — and a path segment
 * is the one place those are not safely representable. `URLSearchParams`
 * encodes all of it without anyone having to remember that.
 *
 * The default period is left out of the URL, so the ordinary case is `/progress`
 * rather than `/progress?period=30d`.
 */

export function progressHref(period: MistakePeriod): string {
  return period === DEFAULT_MISTAKE_PERIOD ? "/progress" : `/progress?period=${period}`;
}

export function mistakeDetailHref(
  selection: MistakeSelection,
  period: MistakePeriod,
): string {
  const query = new URLSearchParams(
    selection.kind === "category"
      ? { category: selection.category }
      : { skill: selection.key },
  );

  if (period !== DEFAULT_MISTAKE_PERIOD) query.set("period", period);

  return `/progress/mistakes?${query.toString()}`;
}

/**
 * What a detail URL is asking for, or null when it is asking for nothing we
 * recognise. A query string is something somebody can type; an unusable one
 * sends them back to Progress rather than to an error.
 *
 * The label is normalised again on the way in. It should already be normalised,
 * because that is what the links above emit — but a hand-typed `?skill=Past%20Tense`
 * should find the same weak point, and normalisation is the only definition of
 * "the same" this feature has.
 */
export function parseMistakeSelection(
  params: Record<string, string | string[] | undefined>,
): MistakeSelection | null {
  const category = first(params.category);
  if (category !== null && isCategory(category)) return { kind: "category", category };

  const skill = first(params.skill);
  if (skill !== null) {
    const key = normalizeLabel(skill);
    if (key !== null) return { kind: "skill", key };
  }

  return null;
}

function first(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" && candidate !== "" ? candidate : null;
}
