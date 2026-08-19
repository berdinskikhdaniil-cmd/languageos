import { skillDisplayName } from "@/features/mistakes/domain/label";
import type { MistakeSelection } from "@/features/mistakes/domain/aggregate";
import type { Messages } from "@/lib/i18n/messages";

/**
 * What to call a weak point on screen, in the reader's own language.
 *
 * One function rather than the same three lines on four screens, because the
 * fallback chain is the part that is easy to get subtly wrong: a category is
 * named from the taxonomy Writing and Speaking already share, a common skill
 * gets a readable name, and anything else is shown exactly as the model wrote
 * it — which is also exactly what is stored.
 *
 * `label` is the stored spelling, when there is one to fall back to. Without it
 * the normalised key is still the model's own words and reads better than an
 * empty heading.
 */
export function targetTitle(
  target: MistakeSelection | null,
  label: string | null,
  messages: Messages,
): string {
  if (!target) return label ?? "";

  return target.kind === "category"
    ? messages.writing.categories[target.category]
    : skillDisplayName(target.key, label ?? target.key, messages.progress.skills);
}
