/**
 * Types for the dashboard's own presentation blocks. Tracker view models live in
 * features/tracker/data/overview.ts, and the error rate's in
 * features/mistakes/domain/accuracy.ts.
 */

export type CoachInsight = {
  headline: string;
  detail: string;
  actionLabel: string;
  actionHref: string;
};
