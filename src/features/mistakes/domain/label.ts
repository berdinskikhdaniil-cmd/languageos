/**
 * Skill labels: how they are grouped, and how they are shown.
 *
 * A label is the model's own short name for the specific weak point — "past
 * tense", "articles", "irregular verb". It is stored exactly as it came back,
 * in canonical English, whatever language the learner reads. Grouping is done
 * on a normalised copy; the stored value never changes.
 *
 * What normalisation is allowed to do is deliberately small: case, whitespace
 * and edge punctuation. "Past tense", "past  tense" and "past tense." are the
 * same skill written three ways and it would be absurd to count them as three.
 *
 * What it must not do is decide that two *different* labels mean the same
 * thing. "past tense" and "irregular verb" overlap in practice and are still
 * different weak points; merging them would need either a taxonomy nobody has
 * written or a model guessing, and a wrong merge is worse than two honest rows.
 * There is no clustering here, no synonym table and no embeddings — if the
 * labels differ, they are shown separately.
 */

/** Punctuation and symbols, at either end only. Inside a label they stay. */
const EDGE_NOISE = /^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu;

/**
 * The grouping key for a label, or null when there is nothing left to group by.
 *
 * Null is a real answer: the model is allowed to return no label at all, and an
 * occurrence without one still counts towards its category. It simply cannot be
 * a repeated *skill*, because there is no skill named.
 */
export function normalizeLabel(label: string | null | undefined): string | null {
  if (typeof label !== "string") return null;

  const normalized = label
    .replace(EDGE_NOISE, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();

  return normalized === "" ? null : normalized;
}

/**
 * Readable names for the skills that actually come back, in both languages.
 *
 * Small on purpose, and optional: this is a courtesy for the handful of labels
 * a learner sees constantly, not the beginning of a taxonomy. A label that is
 * not here is shown exactly as the model wrote it — which is honest, because
 * that is what is stored, and it is what the review screens already show.
 *
 * The keys are normalised labels, so a lookup never has to care about case.
 * The stored value is not affected by anything in this table.
 */
export type SkillDisplayNames = Readonly<Record<string, string>>;

/**
 * What to print for a skill.
 *
 * `original` is the label as it was stored — the fallback, and the reason an
 * unknown skill still reads as language rather than as a key.
 */
export function skillDisplayName(
  key: string,
  original: string,
  names: SkillDisplayNames,
): string {
  return names[key] ?? original;
}
