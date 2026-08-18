/**
 * Activity types and the single place they are grouped for display.
 *
 * The database stores the concrete activity. The dashboard shows three buckets.
 * Every mapping between the two goes through this file — never re-derive it in
 * a component or a query.
 */

export const ACTIVITY_TYPES = [
  "video",
  "podcast",
  "reading",
  "conversation",
  "writing",
  "speaking",
  "other",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** The buckets shown on the dashboard. "other" counts toward total time only. */
export const ACTIVITY_GROUPS = ["input", "speaking", "writing", "other"] as const;

export type ActivityGroup = (typeof ACTIVITY_GROUPS)[number];

const GROUP_BY_TYPE: Record<ActivityType, ActivityGroup> = {
  video: "input",
  podcast: "input",
  reading: "input",
  conversation: "speaking",
  speaking: "speaking",
  writing: "writing",
  other: "other",
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  video: "Video",
  podcast: "Podcast",
  reading: "Reading",
  conversation: "Conversation",
  writing: "Writing",
  speaking: "Speaking",
  other: "Other",
};

/** The three buckets the dashboard breaks Today down into, in display order. */
export const BREAKDOWN_GROUPS = ["input", "speaking", "writing"] as const;

export const GROUP_LABELS: Record<ActivityGroup, string> = {
  input: "Input",
  speaking: "Speaking",
  writing: "Writing",
  other: "Other",
};

export function activityGroup(type: ActivityType): ActivityGroup {
  return GROUP_BY_TYPE[type];
}

export function isActivityType(value: unknown): value is ActivityType {
  return typeof value === "string" && (ACTIVITY_TYPES as readonly string[]).includes(value);
}

/**
 * Activities offered when starting a live timer. Speaking practice is excluded
 * on purpose: it becomes its own guided flow with AI feedback, not a stopwatch.
 */
export const TIMEABLE_ACTIVITY_TYPES = [
  "video",
  "podcast",
  "reading",
  "conversation",
  "writing",
  "other",
] as const satisfies readonly ActivityType[];
