import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  WritingEntryView,
  type WritingEntryViewModel,
} from "@/features/writing/components/writing-entry-view";
import { getWritingEntry } from "@/features/writing/data/entries";
import type { FragmentSpan } from "@/features/writing/domain/fragments";
import { isCategory, isSeverity } from "@/features/writing/domain/review";
import { isAiConfigured } from "@/lib/ai/config";
import { resolvePageAccess } from "@/lib/auth/page-access";

export const metadata: Metadata = { title: "Writing" };

export const dynamic = "force-dynamic";

/** A retry runs the provider call inside a server action on this page. */
export const maxDuration = 60;

/**
 * One piece of writing.
 *
 * The entry is fetched with the caller's own user id, so an id belonging to
 * somebody else is simply not found — the URL is not an access token, and there
 * is no difference between "does not exist" and "is not yours".
 */
export default async function WritingEntryPage({ params }: PageProps<"/practice/writing/[entryId]">) {
  const access = await resolvePageAccess();
  if (access.status === "onboarding-required") redirect("/onboarding");
  if (access.status === "signed-out") return null;
  if (access.status === "unavailable") {
    return (
      <section className="rounded-[var(--radius-card)] bg-surface p-5">
        <p className="text-[1.0625rem] font-semibold leading-snug">
          Your writing is not reachable right now.
        </p>
        <p className="mt-2 text-[0.9375rem] leading-[1.5] text-muted">
          The database is not responding. Nothing has been lost — reload in a moment.
        </p>
      </section>
    );
  }

  const { entryId } = await params;
  const detail = await getWritingEntry(entryId, access.user.id);
  if (!detail) notFound();

  // An installation with no AI configured should say so, rather than leave the
  // learner tapping a button that can never work.
  const unreviewedReason = isAiConfigured() ? null : "not_configured";

  return <WritingEntryView entry={toViewModel(detail, unreviewedReason)} />;
}

function toViewModel(
  detail: NonNullable<Awaited<ReturnType<typeof getWritingEntry>>>,
  unreviewedReason: string | null,
): WritingEntryViewModel {
  const { entry, review, issues } = detail;

  const base = {
    id: entry.id,
    type: entry.type,
    originalText: entry.originalText,
    revisedText: entry.revisedText,
    wordCount: entry.wordCount,
    unreviewedReason,
  };

  if (!review) return { ...base, review: null };

  if (review.status !== "completed" || review.summary === null || review.improvedText === null) {
    return {
      ...base,
      review:
        review.status === "pending"
          ? { status: "pending" }
          : { status: "failed", reason: review.failureReason },
    };
  }

  /**
   * The enum values come out of Postgres columns whose type only permits them,
   * so these guards never fire in practice. They are here because the view
   * model is what the highlighting slices text against, and a surprise there
   * should drop one issue rather than break the page.
   */
  const display = issues.filter(
    (issue) => isCategory(issue.category) && isSeverity(issue.severity),
  );

  const spans: { span: FragmentSpan; issueIndex: number }[] = [];
  display.forEach((issue, index) => {
    if (issue.startOffset !== null && issue.endOffset !== null) {
      spans.push({ span: { start: issue.startOffset, end: issue.endOffset }, issueIndex: index });
    }
  });

  return {
    ...base,
    review: {
      status: "completed",
      summary: review.summary,
      improvedText: review.improvedText,
      issues: display.map((issue) => ({
        id: issue.id,
        category: issue.category,
        label: issue.label,
        severity: issue.severity,
        originalFragment: issue.originalFragment,
        suggestion: issue.suggestion,
        explanation: issue.explanation,
        highlighted: issue.startOffset !== null,
      })),
      spans,
    },
  };
}
