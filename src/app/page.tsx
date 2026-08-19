import { redirect, unstable_rethrow } from "next/navigation";
import { CoachCard } from "@/features/dashboard/components/coach-card";
import { ProgressPreview } from "@/features/dashboard/components/progress-preview";
import { TodayBreakdown } from "@/features/dashboard/components/today-breakdown";
import { TrackerUnavailable } from "@/features/dashboard/components/tracker-unavailable";
import { WeekActivityCard } from "@/features/dashboard/components/week-activity-card";
import { demoCoachInsight } from "@/features/dashboard/demo-analytics";
import { getMistakeOverview } from "@/features/mistakes/data/mistakes";
import type { WritingAccuracyTrend } from "@/features/mistakes/domain/accuracy";
import { TrackerActions } from "@/features/tracker/components/tracker-actions";
import { getTrackerOverview, type TrackerOverview } from "@/features/tracker/data/overview";
import { resolvePageAccess } from "@/lib/auth/page-access";
import { getMessages } from "@/lib/i18n/messages";

/**
 * The tracker is per-user live data, so this screen is never prerendered. That
 * also keeps `next build` independent of a running database.
 */
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  /**
   * Authorization is not delegated to the layout.
   *
   * React renders a page even when its layout chooses not to place `children`,
   * so a layout gate is a presentation decision, not a security boundary. The
   * boundary is here and in the data layer: without a set-up user there is no
   * query and nothing to render.
   */
  const access = await resolvePageAccess();

  // An account that has not chosen a language has no dashboard to show, and
  // there is nothing here for it to fall back to.
  if (access.status === "onboarding-required") redirect("/onboarding");
  if (access.status === "signed-out") return null;

  /**
   * The language is read from the same access result that authorised the page,
   * so the words and the numbers cannot come from two different accounts. With
   * identity unreadable there is no preference to read and English is all there
   * is — which is also the only state where nothing personal is on screen.
   */
  const language = access.status === "ready" ? access.user.uiLanguage : undefined;
  const messages = getMessages(language);

  let overview: TrackerOverview | null = null;
  /**
   * The error rate, over the last thirty days and the thirty before it.
   *
   * A separate failure from the tracker's on purpose: two reads, two things
   * that can go wrong, and losing one of them should not cost the other. With
   * nothing read at all the block reports insufficient data, which is exactly
   * what it means — no words were seen.
   */
  let accuracy: WritingAccuracyTrend = { current: { status: "insufficient", words: 0 }, previous: null };

  if (access.status === "ready") {
    try {
      overview = await getTrackerOverview(access.user);
    } catch (error) {
      // Never swallow Next.js's own control-flow signals.
      unstable_rethrow(error);
      // The tracker could not be read — almost always a database that is not
      // running. Say so rather than reporting zeroes.
      console.error("[dashboard] tracker unavailable", error);
    }

    try {
      accuracy = (await getMistakeOverview(access.user, "30d")).accuracy;
    } catch (error) {
      unstable_rethrow(error);
      console.error("[dashboard] could not read the error rate", error);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <h1 className="sr-only">{messages.dashboard.title}</h1>

      {overview ? (
        <>
          <WeekActivityCard week={overview.week} messages={messages} language={language} />
          <TodayBreakdown today={overview.today} messages={messages} language={language} />
          <TrackerActions
            activeSession={overview.activeSession}
            todayDayKey={overview.todayDayKey}
          />
        </>
      ) : (
        <TrackerUnavailable messages={messages} />
      )}

      {/* Still illustrative — see features/dashboard/demo-analytics.ts. */}
      <CoachCard insight={demoCoachInsight(messages)} />
      {/* Real, from the learner's own reviewed writing. See features/mistakes. */}
      <ProgressPreview trend={accuracy} messages={messages} language={language} />
    </div>
  );
}
