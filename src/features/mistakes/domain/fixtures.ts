import type { IssueCategory, IssueSeverity } from "@/features/writing/domain/review";
import type { MistakeOccurrence, MistakeSource } from "./occurrence";

/**
 * Occurrences for the pure tests. Not exported to the app — the real ones come
 * out of ../data, and this file exists so the counting rules can be checked
 * without a database.
 */
export function occurrence(
  overrides: Partial<MistakeOccurrence> & { issueId: string },
): MistakeOccurrence {
  return {
    source: "writing" as MistakeSource,
    sourceId: "entry-1",
    createdAt: new Date("2026-08-19T09:00:00Z"),
    category: "grammar" as IssueCategory,
    label: "past tense",
    severity: "error" as IssueSeverity,
    originalFragment: "I go",
    suggestion: "I went",
    explanation: "Yesterday needs the past tense.",
    languageCode: "en",
    position: 0,
    ...overrides,
  };
}
