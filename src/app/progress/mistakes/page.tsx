import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import { OccurrenceList } from "@/features/mistakes/components/occurrence-list";
import { getMistakeOccurrences } from "@/features/mistakes/data/mistakes";
import { countSeverities } from "@/features/mistakes/domain/aggregate";
import { skillDisplayName } from "@/features/mistakes/domain/label";
import { parseMistakeSelection, progressHref } from "@/features/mistakes/domain/links";
import type { MistakeOccurrence } from "@/features/mistakes/domain/occurrence";
import { parseMistakePeriod } from "@/features/mistakes/domain/period";
import { resolvePageAccess } from "@/lib/auth/page-access";
import { getMessages, type Messages } from "@/lib/i18n/messages";

export const metadata: Metadata = { title: "Mistakes" };

export const dynamic = "force-dynamic";

/**
 * One weak point, and every time it came up.
 *
 * The selection travels in the query string rather than in the path, because a
 * skill label is the model's own words and can hold a slash or an apostrophe —
 * the one thing a path segment cannot carry safely. An unrecognised selection
 * goes back to Progress; a URL is something somebody can type, and a typo is
 * not an error page.
 *
 * Nothing here is scoped by anything the URL says about identity, because the
 * URL says nothing about it: the occurrences come from the authenticated user's
 * own reviews, in the language they are currently studying.
 */
export default async function MistakeDetailPage({
  searchParams,
}: PageProps<"/progress/mistakes">) {
  const access = await resolvePageAccess();
  if (access.status === "onboarding-required") redirect("/onboarding");
  if (access.status === "signed-out") return null;

  const params = await searchParams;
  const period = parseMistakePeriod(params.period);
  const selection = parseMistakeSelection(params);
  if (!selection) redirect(progressHref(period));

  const language = access.status === "ready" ? access.user.uiLanguage : undefined;
  const messages = getMessages(language);

  let occurrences: MistakeOccurrence[] | null = null;

  if (access.status === "ready") {
    try {
      occurrences = await getMistakeOccurrences(access.user, period, selection);
    } catch (error) {
      unstable_rethrow(error);
      console.error("[progress] could not read occurrences", error);
    }
  }

  const title =
    selection.kind === "category"
      ? messages.writing.categories[selection.category]
      : skillTitle(selection.key, occurrences ?? [], messages);

  const counts = countSeverities(occurrences ?? []);

  return (
    <div className="pt-3">
      <Link
        href={progressHref(period)}
        className="-ml-1.5 inline-flex items-center gap-0.5 py-1 pr-2 text-[0.8125rem] leading-none text-muted transition-colors active:text-fg"
      >
        <ChevronLeft size={15} strokeWidth={2} aria-hidden />
        {messages.progress.backToProgress}
      </Link>

      <h1 className="mt-3 break-words text-[1.75rem] font-bold leading-tight tracking-[-0.03em]">
        {title}
      </h1>

      {access.status === "ready" && occurrences ? (
        <>
          <p className="mt-2 text-[0.9375rem] leading-snug text-muted">
            {messages.progress.occurrencesInWindow(
              messages.progress.occurrenceCount(occurrences.length),
              messages.progress.windowsInline[period],
            )}
          </p>

          {counts.suggestions > 0 && counts.mistakes > 0 ? (
            <p className="mt-1 text-[0.8125rem] leading-snug text-faint">
              {messages.progress.breakdown([
                messages.progress.mistakeCount(counts.mistakes),
                messages.progress.suggestionCount(counts.suggestions),
              ])}
            </p>
          ) : null}

          <OccurrenceList
            occurrences={occurrences}
            timeZone={access.user.timeZone}
            language={access.user.uiLanguage}
            now={new Date()}
            messages={messages}
          />
        </>
      ) : (
        <section className="mt-6 rounded-[var(--radius-card)] bg-surface p-5">
          <p className="text-[1.0625rem] font-semibold leading-snug">
            {messages.progress.unavailableTitle}
          </p>
          <p className="mt-2 text-[0.9375rem] leading-[1.5] text-muted">
            {messages.progress.unavailableBody}
          </p>
        </section>
      )}
    </div>
  );
}

/**
 * A readable name for the skill, falling back to the label exactly as some
 * review stored it — the newest spelling, since occurrences arrive newest
 * first. With nothing to fall back to, the key itself is still the model's own
 * words and is better than an empty heading.
 */
function skillTitle(
  key: string,
  occurrences: MistakeOccurrence[],
  messages: Messages,
): string {
  const stored = occurrences.find((occurrence) => occurrence.label !== null)?.label;
  return skillDisplayName(key, stored ?? key, messages.progress.skills);
}
