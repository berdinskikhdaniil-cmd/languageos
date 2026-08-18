import { unstable_rethrow } from "next/navigation";
import { CoachCard } from "@/features/dashboard/components/coach-card";
import { ProgressPreview } from "@/features/dashboard/components/progress-preview";
import { TodayBreakdown } from "@/features/dashboard/components/today-breakdown";
import { TrackerUnavailable } from "@/features/dashboard/components/tracker-unavailable";
import { WeekActivityCard } from "@/features/dashboard/components/week-activity-card";
import { DEMO_ACCURACY_TREND, DEMO_COACH_INSIGHT } from "@/features/dashboard/demo-analytics";
import { TrackerActions } from "@/features/tracker/components/tracker-actions";
import { getTrackerOverview, type TrackerOverview } from "@/features/tracker/data/overview";
import { getCurrentUser } from "@/lib/auth/current-user";

/**
 * The tracker is per-user live data, so this screen is never prerendered. That
 * also keeps `next build` independent of a running database.
 */
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let overview: TrackerOverview | null = null;

  /**
   * Authorization is not delegated to the layout.
   *
   * React renders a page even when its layout chooses not to place `children`,
   * so a layout gate is a presentation decision, not a security boundary. The
   * boundary is here and in the data layer: without a user there is no query and
   * nothing to render.
   */
  try {
    const user = await getCurrentUser();
    if (!user) return null;
    overview = await getTrackerOverview(user);
  } catch (error) {
    // Never swallow Next.js's own dynamic-rendering signal from `cookies()`.
    unstable_rethrow(error);
    // Identity or the tracker could not be read — almost always a database that
    // is not running. Say so rather than reporting zeroes.
    console.error("[dashboard] tracker unavailable", error);
  }

  return (
    <div className="flex flex-col gap-7">
      <h1 className="sr-only">Dashboard</h1>

      {overview ? (
        <>
          <WeekActivityCard week={overview.week} />
          <TodayBreakdown today={overview.today} />
          <TrackerActions
            activeSession={overview.activeSession}
            todayDayKey={overview.todayDayKey}
          />
        </>
      ) : (
        <TrackerUnavailable />
      )}

      {/* Still illustrative — see features/dashboard/demo-analytics.ts. */}
      <CoachCard insight={DEMO_COACH_INSIGHT} />
      <ProgressPreview trend={DEMO_ACCURACY_TREND} />
    </div>
  );
}
