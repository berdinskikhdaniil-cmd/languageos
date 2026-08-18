/**
 * Types for the dashboard's own presentation blocks. Tracker view models live in
 * features/tracker/data/overview.ts.
 */

export type CoachInsight = {
  headline: string;
  detail: string;
  actionLabel: string;
  actionHref: string;
};

export type AccuracyTrend = {
  label: string;
  from: number;
  to: number;
  /** Oldest to newest. Drives the sparkline only. */
  series: number[];
  caption: string;
};
