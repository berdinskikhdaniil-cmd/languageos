import { describe, expect, it } from "vitest";
import {
  DAILY_GOAL_OPTIONS,
  MAX_DAILY_GOAL_MINUTES,
  MIN_DAILY_GOAL_MINUTES,
  SUGGESTED_DAILY_GOAL_MINUTES,
  isDailyGoalMinutes,
} from "./goals";

describe("the goals onboarding offers", () => {
  it("are the four the design calls for", () => {
    expect(DAILY_GOAL_OPTIONS).toEqual([15, 30, 45, 60]);
  });

  it("include the one pre-selected for a new learner", () => {
    expect(DAILY_GOAL_OPTIONS).toContain(SUGGESTED_DAILY_GOAL_MINUTES);
    expect(SUGGESTED_DAILY_GOAL_MINUTES).toBe(30);
  });

  it("are all storable", () => {
    for (const option of DAILY_GOAL_OPTIONS) {
      expect(isDailyGoalMinutes(option)).toBe(true);
    }
  });
});

describe("isDailyGoalMinutes", () => {
  it("accepts the ends of the range the database also enforces", () => {
    expect(isDailyGoalMinutes(MIN_DAILY_GOAL_MINUTES)).toBe(true);
    expect(isDailyGoalMinutes(MAX_DAILY_GOAL_MINUTES)).toBe(true);
  });

  it("refuses anything outside it", () => {
    expect(isDailyGoalMinutes(MIN_DAILY_GOAL_MINUTES - 1)).toBe(false);
    expect(isDailyGoalMinutes(MAX_DAILY_GOAL_MINUTES + 1)).toBe(false);
  });

  it("refuses anything that is not a whole number", () => {
    for (const value of [30.5, "30", null, undefined, NaN, Infinity, {}]) {
      expect(isDailyGoalMinutes(value)).toBe(false);
    }
  });
});
