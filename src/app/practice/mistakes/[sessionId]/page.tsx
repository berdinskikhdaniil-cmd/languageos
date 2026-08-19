import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PracticeFailed } from "@/features/mistake-practice/components/practice-failed";
import { PracticePending } from "@/features/mistake-practice/components/practice-pending";
import { PracticeResult } from "@/features/mistake-practice/components/practice-result";
import { PracticeRunner } from "@/features/mistake-practice/components/practice-runner";
import { targetTitle } from "@/features/mistake-practice/components/target-title";
import { getPracticeSession } from "@/features/mistake-practice/data/sessions";
import { buildSessionView } from "@/features/mistake-practice/domain/session-view";
import { toStoredTarget } from "@/features/mistake-practice/domain/target";
import { resolvePageAccess } from "@/lib/auth/page-access";
import { getMessages } from "@/lib/i18n/messages";

export const metadata: Metadata = { title: "Practice" };

export const dynamic = "force-dynamic";

/** A retry and the check both run a provider call inside a server action here. */
export const maxDuration = 60;

/**
 * One practice set, in whichever of its states it is in.
 *
 * The session is fetched with the caller's own user id, so an id belonging to
 * somebody else is simply not found — the URL is not an access token, and there
 * is no difference between "does not exist" and "is not yours".
 *
 * What reaches the browser is decided by `buildSessionView` rather than here:
 * an unfinished set carries prompts and the learner's own answers and nothing
 * else, because a canonical answer in the page payload is the answer key.
 */
export default async function MistakePracticePage({
  params,
}: PageProps<"/practice/mistakes/[sessionId]">) {
  const access = await resolvePageAccess();
  if (access.status === "onboarding-required") redirect("/onboarding");
  if (access.status === "signed-out") return null;

  const messages = getMessages(access.status === "ready" ? access.user.uiLanguage : undefined);

  if (access.status === "unavailable") {
    return (
      <section className="mt-6 rounded-[var(--radius-card)] bg-surface p-5">
        <p className="text-[1.0625rem] font-semibold leading-snug">
          {messages.progress.unavailableTitle}
        </p>
        <p className="mt-2 text-[0.9375rem] leading-[1.5] text-muted">
          {messages.progress.unavailableBody}
        </p>
      </section>
    );
  }

  const { sessionId } = await params;
  const detail = await getPracticeSession(sessionId, access.user.id);
  if (!detail) notFound();

  /**
   * No `targetLabel`: the heading falls back to the normalised key, which is
   * the model's own words in the same order. Reaching for the stored spelling
   * would mean loading the whole mistake workload again to render a title, and
   * a common skill gets a readable name from the dictionary anyway.
   */
  const view = buildSessionView({ session: detail.session, items: detail.items });

  const title = targetTitle(view.target, view.targetLabel, messages);

  return (
    <div className="pt-3">
      <Link
        href="/practice"
        className="-ml-1.5 inline-flex items-center gap-0.5 py-1 pr-2 text-[0.8125rem] leading-none text-muted transition-colors active:text-fg"
      >
        <ChevronLeft size={15} strokeWidth={2} aria-hidden />
        {messages.mistakePractice.backToPractice}
      </Link>

      <h1 className="mt-3 break-words text-[1.75rem] font-bold leading-tight tracking-[-0.03em]">
        {title}
      </h1>

      {view.status === "generating" || view.status === "grading" ? (
        <PracticePending phase={view.status} />
      ) : null}

      {view.status === "failed" ? (
        <PracticeFailed sessionId={view.sessionId} failure={view.failure} />
      ) : null}

      {view.status === "ready" ? (
        <div className="mt-7">
          <PracticeRunner
            sessionId={view.sessionId}
            exercises={view.exercises}
            initialFailure={view.failure}
          />
        </div>
      ) : null}

      {view.status === "completed" ? (
        <PracticeResult
          results={view.results}
          tally={view.tally}
          target={view.target ? toStoredTarget(view.target) : null}
          messages={messages}
        />
      ) : null}
    </div>
  );
}
