import type { Messages } from "@/lib/i18n/messages";
import type { AccuracyTrend, CoachInsight } from "./types";

/**
 * DEMO CONTENT — NOT REAL DATA.
 *
 * These two blocks are still illustrative. The coach needs a model reading the
 * learner's history, and the error rate needs the writing-review pipeline;
 * neither exists yet. Translating them changes nothing about that: they are
 * demo copy in two languages rather than one, and the caption says so on screen.
 *
 * Tracker figures never come from this file. They are queried in
 * features/tracker/data/overview.ts and are kept in a separate object all the
 * way to the screen, so nothing on the dashboard is half real and half made up.
 */

export function demoCoachInsight(messages: Messages): CoachInsight {
  return {
    headline: messages.dashboard.demo.coachHeadline,
    detail: messages.dashboard.demo.coachDetail,
    actionLabel: messages.dashboard.demo.coachAction,
    // The copy is still illustrative, but the button it offers now goes
    // somewhere real: speaking practice exists.
    actionHref: "/practice/speaking",
  };
}

export function demoAccuracyTrend(messages: Messages): AccuracyTrend {
  return {
    label: messages.dashboard.demo.trendLabel,
    from: 105,
    to: 82,
    series: [105, 101, 104, 96, 93, 95, 88, 85, 82],
    caption: messages.dashboard.demo.trendCaption,
  };
}
