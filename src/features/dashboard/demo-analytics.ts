import type { AccuracyTrend, CoachInsight } from "./types";

/**
 * DEMO CONTENT — NOT REAL DATA.
 *
 * These two blocks are still illustrative. The coach needs a model reading the
 * learner's history, and the error rate needs the writing-review pipeline;
 * neither exists yet.
 *
 * Tracker figures never come from this file. They are queried in
 * features/tracker/data/overview.ts and are kept in a separate object all the
 * way to the screen, so nothing on the dashboard is half real and half made up.
 */

export const DEMO_COACH_INSIGHT: CoachInsight = {
  headline: "Input is running well ahead of speaking.",
  detail: "Five minutes out loud today would even out the week.",
  actionLabel: "Start speaking",
  actionHref: "/practice",
};

export const DEMO_ACCURACY_TREND: AccuracyTrend = {
  label: "Errors / 1000 words",
  from: 105,
  to: 82,
  series: [105, 101, 104, 96, 93, 95, 88, 85, 82],
  caption: "Demo figures until writing review is built.",
};
