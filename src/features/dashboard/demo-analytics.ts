import type { Messages } from "@/lib/i18n/messages";
import type { CoachInsight } from "./types";

/**
 * DEMO CONTENT — NOT REAL DATA.
 *
 * One block, and only one: the coach still needs a model reading the learner's
 * history, and that does not exist yet. Translating it changed nothing about
 * that — it is demo copy in two languages rather than one.
 *
 * The error rate that used to live here is gone, because it is real now. It is
 * computed from the learner's own reviewed writing in features/mistakes and
 * says so honestly when there is not enough of it. Nothing in this file feeds
 * that figure any more, and nothing should feed it from here again.
 *
 * Tracker figures never came from this file either. They are queried in
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
