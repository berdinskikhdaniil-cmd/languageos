import { loadMistakeWorkload } from "@/features/mistakes/data/mistakes";
import {
  earliestInstantToLoad,
  periodWindow,
  previousPeriodWindow,
  type MistakePeriod,
} from "@/features/mistakes/domain/period";
import { getSessionsInInterval } from "@/features/tracker/data/sessions";
import { HEATMAP_WEEKS } from "@/features/tracker/domain/heatmap";
import type { OnboardedUser } from "@/lib/auth/current-user";
import { addLocalDays, startOfLocalDay, startOfLocalWeek } from "@/lib/time";
import { buildProgressAnalytics, type ProgressAnalytics } from "../domain/analytics";

/**
 * Two reads, and then arithmetic.
 *
 * Everything the Progress screen draws comes from `sessions` and from the two
 * issue tables the mistake engine already reads. There is no analytics table
 * and nothing is precomputed: an aggregate stored anywhere is an aggregate that
 * can go stale, and at this size the honest answer is cheaper than the cached
 * one.
 *
 * Both reads are bounded by the window the screen is showing, widened only as
 * far as the screen genuinely needs — the heatmap always covers twelve weeks,
 * and the error rate compares against the period before the selected one, so
 * the earlier of those two is where the read starts.
 *
 * Study time is scoped to the account rather than to one language, exactly as
 * the dashboard scopes it. That is the tracker's existing rule, and having the
 * same week read differently on two screens would be worse than the
 * inconsistency it would fix — a second language does not exist yet.
 */

export async function getProgressAnalytics(
  user: OnboardedUser,
  period: MistakePeriod,
  now = new Date(),
): Promise<ProgressAnalytics> {
  const { timeZone } = user;

  const window = periodWindow(period, now, timeZone);
  const previous = previousPeriodWindow(period, now, timeZone);

  /** Local midnight after today: nothing is logged in the future. */
  const to = addLocalDays(startOfLocalDay(now, timeZone), 1, timeZone);
  const heatmapFrom = addLocalDays(
    startOfLocalWeek(now, timeZone),
    -(HEATMAP_WEEKS - 1) * 7,
    timeZone,
  );

  /**
   * All time has no lower bound, so the read has none either. It is still one
   * user's own sessions on the (user_id, started_at) index — the same shape the
   * dashboard runs, over a longer range.
   */
  const sessionsFrom =
    window === null
      ? new Date(0)
      : new Date(Math.min(window.from.getTime(), heatmapFrom.getTime()));

  const [sessions, workload] = await Promise.all([
    getSessionsInInterval(user.id, sessionsFrom, to),
    loadMistakeWorkload({
      userId: user.id,
      userLanguageId: user.primaryLanguage.id,
      languageCode: user.primaryLanguage.code,
      from: earliestInstantToLoad(period, now, timeZone),
    }),
  ]);

  return buildProgressAnalytics({
    period,
    window,
    previousWindow: previous,
    sessions,
    workload,
    timeZone,
    now,
    language: user.uiLanguage,
    dailyGoalMinutes: user.primaryLanguage.dailyGoalMinutes,
  });
}
