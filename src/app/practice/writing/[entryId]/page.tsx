import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { WritingEntryView } from "@/features/writing/components/writing-entry-view";
import { getWritingEntry } from "@/features/writing/data/entries";
import { buildEntryView } from "@/features/writing/domain/review-view";
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

  return (
    <WritingEntryView
      entry={buildEntryView({
        ...detail,
        // An installation with no AI configured should say so, rather than
        // leave the learner tapping a button that can never work.
        unreviewedReason: isAiConfigured() ? null : "not_configured",
      })}
    />
  );
}
