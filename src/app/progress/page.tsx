import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { AccuracySummary } from "@/features/mistakes/components/accuracy-summary";
import { MistakesEmpty } from "@/features/mistakes/components/mistakes-empty";
import { PeriodTabs } from "@/features/mistakes/components/period-tabs";
import { RecentMistakes } from "@/features/mistakes/components/recent-mistakes";
import { RepeatedMistakes } from "@/features/mistakes/components/repeated-mistakes";
import { SourceBalance } from "@/features/mistakes/components/source-balance";
import { WeakPoints } from "@/features/mistakes/components/weak-points";
import { isPlottableSeries } from "@/features/mistakes/domain/quality-trend";
import { parseMistakePeriod } from "@/features/mistakes/domain/period";
import { ConsistencyHeatmap } from "@/features/progress/components/consistency-heatmap";
import { MistakesOverview } from "@/features/progress/components/mistakes-overview";
import { PracticeBalance } from "@/features/progress/components/practice-balance";
import { QualityChart } from "@/features/progress/components/quality-chart";
import { StudyTimeChart } from "@/features/progress/components/study-time-chart";
import { getProgressAnalytics } from "@/features/progress/data/analytics";
import type { ProgressAnalytics } from "@/features/progress/domain/analytics";
import { resolvePageAccess } from "@/lib/auth/page-access";
import { getMessages } from "@/lib/i18n/messages";

export const metadata: Metadata = { title: "Progress" };

/** Reads the learner's own sessions and mistakes, so it is never prerendered. */
export const dynamic = "force-dynamic";

/**
 * How the learning is going, read from work the learner already did.
 *
 * Two questions, in that order: how they are practising — how much, how often,
 * and of what — and then how the language itself is changing. Every figure is
 * an aggregation over `sessions`, `writing_issues` and `speaking_issues`. There
 * is no analytics table, nothing is illustrative, and a section with no data
 * behind it is not drawn at all rather than drawn empty.
 *
 * The order is deliberate and so are the omissions. Nothing here interprets the
 * practice balance, because there is no defensible ideal ratio to compare it
 * against; that is a coach feature and needs a method first.
 */
export default async function ProgressPage({ searchParams }: PageProps<"/progress">) {
  const access = await resolvePageAccess();
  if (access.status === "onboarding-required") redirect("/onboarding");
  if (access.status === "signed-out") return null;

  const language = access.status === "ready" ? access.user.uiLanguage : undefined;
  const messages = getMessages(language);
  const period = parseMistakePeriod((await searchParams).period);

  let analytics: ProgressAnalytics | null = null;

  if (access.status === "ready") {
    try {
      analytics = await getProgressAnalytics(access.user, period);
    } catch (error) {
      // Never swallow Next.js's own control-flow signals.
      unstable_rethrow(error);
      // Say the numbers could not be read, rather than reporting zeroes — an
      // unreachable database and a quiet month look identical otherwise.
      console.error("[progress] could not read analytics", error);
    }
  }

  return (
    <div className="pt-3">
      {/*
        The title and the period control are one block: the tabs say what the
        whole screen is counting, so they belong to its heading rather than
        floating as the first section beneath it.
      */}
      <header>
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.03em]">
          {messages.progress.title}
        </h1>
        {access.status === "ready" && analytics ? (
          <div className="mt-5">
            <PeriodTabs current={period} messages={messages} />
          </div>
        ) : null}
      </header>

      {access.status === "ready" && analytics ? (
        analytics.hasAnything ? (
          /* Roomier than the rest of the product on purpose: this screen is
             read rather than operated, and its sections answer unrelated
             questions. */
          <div className="mt-8 flex flex-col gap-10">
            <StudyTimeChart
              buckets={analytics.activity.buckets}
              summary={analytics.activity.summary}
              messages={messages}
              language={access.user.uiLanguage}
            />

            <PracticeBalance
              shares={analytics.balance.shares}
              totalSeconds={analytics.balance.totalSeconds}
              messages={messages}
              language={access.user.uiLanguage}
            />

            {/* Only once something has been reviewed. With nothing to divide,
                an "errors per 1000 words" heading is a question, not a metric. */}
            {analytics.mistakes.writingReviewed > 0 ? (
              <AccuracySummary
                trend={analytics.mistakes.accuracy}
                period={period}
                messages={messages}
                language={access.user.uiLanguage}
                tone="section"
                chart={
                  isPlottableSeries(analytics.quality) ? (
                    <QualityChart series={analytics.quality} messages={messages} />
                  ) : null
                }
              />
            ) : null}

            {analytics.mistakes.hasReviewedWork ? (
              <>
                <MistakesOverview overview={analytics.mistakes} messages={messages} />
                <SourceBalance balance={analytics.mistakes.balance} messages={messages} />
              </>
            ) : null}

            <ConsistencyHeatmap view={analytics.consistency} messages={messages} />

            {analytics.mistakes.hasReviewedWork ? (
              <>
                <WeakPoints
                  items={analytics.mistakes.weakPoints}
                  period={period}
                  messages={messages}
                />
                <RepeatedMistakes
                  items={analytics.mistakes.repeated}
                  period={period}
                  messages={messages}
                />
                <RecentMistakes
                  occurrences={analytics.mistakes.recent}
                  timeZone={access.user.timeZone}
                  language={access.user.uiLanguage}
                  now={new Date()}
                  messages={messages}
                />
              </>
            ) : null}
          </div>
        ) : (
          <div className="mt-6">
            <MistakesEmpty messages={messages} />
          </div>
        )
      ) : (
        <section className="mt-8 rounded-[var(--radius-card)] bg-surface p-5">
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
