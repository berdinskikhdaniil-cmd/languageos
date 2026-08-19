import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { AccuracySummary } from "@/features/mistakes/components/accuracy-summary";
import { MistakeSummary } from "@/features/mistakes/components/mistake-summary";
import { MistakesEmpty } from "@/features/mistakes/components/mistakes-empty";
import { PeriodTabs } from "@/features/mistakes/components/period-tabs";
import { RecentMistakes } from "@/features/mistakes/components/recent-mistakes";
import { RepeatedMistakes } from "@/features/mistakes/components/repeated-mistakes";
import { SourceBalance } from "@/features/mistakes/components/source-balance";
import { WeakPoints } from "@/features/mistakes/components/weak-points";
import { getMistakeOverview } from "@/features/mistakes/data/mistakes";
import type { MistakeOverview } from "@/features/mistakes/domain/overview";
import { parseMistakePeriod } from "@/features/mistakes/domain/period";
import { resolvePageAccess } from "@/lib/auth/page-access";
import { getMessages } from "@/lib/i18n/messages";

export const metadata: Metadata = { title: "Progress" };

/** Reads the learner's own mistakes, so it is never prerendered. */
export const dynamic = "force-dynamic";

/**
 * What the language is doing, read from work the learner already did.
 *
 * Everything on this screen is an aggregation over `writing_issues` and
 * `speaking_issues` — the rows Writing and Speaking wrote when they reviewed
 * something. Nothing is copied into a third table for the sake of counting it,
 * and nothing here is illustrative: an account with no reviewed work gets an
 * empty state rather than a plausible-looking chart.
 */
export default async function ProgressPage({ searchParams }: PageProps<"/progress">) {
  const access = await resolvePageAccess();
  if (access.status === "onboarding-required") redirect("/onboarding");
  if (access.status === "signed-out") return null;

  const language = access.status === "ready" ? access.user.uiLanguage : undefined;
  const messages = getMessages(language);
  const period = parseMistakePeriod((await searchParams).period);

  let overview: MistakeOverview | null = null;

  if (access.status === "ready") {
    try {
      overview = await getMistakeOverview(access.user, period);
    } catch (error) {
      // Never swallow Next.js's own control-flow signals.
      unstable_rethrow(error);
      // Say the numbers could not be read, rather than reporting zeroes — an
      // unreachable database and a clean week look identical otherwise.
      console.error("[progress] could not read mistakes", error);
    }
  }

  return (
    <div className="flex flex-col gap-8 pt-3">
      <header>
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.03em]">
          {messages.progress.title}
        </h1>
      </header>

      {access.status === "ready" && overview ? (
        <>
          <PeriodTabs current={period} messages={messages} />

          {overview.hasReviewedWork ? (
            <>
              <MistakeSummary overview={overview} period={period} messages={messages} />
              <AccuracySummary
                trend={overview.accuracy}
                period={period}
                messages={messages}
                language={access.user.uiLanguage}
              />
              <WeakPoints items={overview.weakPoints} period={period} messages={messages} />
              <RepeatedMistakes items={overview.repeated} period={period} messages={messages} />
              <SourceBalance balance={overview.balance} messages={messages} />
              <RecentMistakes
                occurrences={overview.recent}
                timeZone={access.user.timeZone}
                language={access.user.uiLanguage}
                now={new Date()}
                messages={messages}
              />
            </>
          ) : (
            <MistakesEmpty messages={messages} />
          )}
        </>
      ) : (
        <section className="rounded-[var(--radius-card)] bg-surface p-5">
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
