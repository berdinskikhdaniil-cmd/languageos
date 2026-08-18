import { describe, expect, it } from "vitest";
import {
  ACTIVITY_TYPES,
  BREAKDOWN_GROUPS,
  TIMEABLE_ACTIVITY_TYPES,
  activityGroup,
  isActivityType,
} from "./activity";

describe("activityGroup", () => {
  it("puts consumed material into input", () => {
    expect(activityGroup("video")).toBe("input");
    expect(activityGroup("podcast")).toBe("input");
    expect(activityGroup("reading")).toBe("input");
  });

  it("puts spoken practice into speaking", () => {
    expect(activityGroup("conversation")).toBe("speaking");
    expect(activityGroup("speaking")).toBe("speaking");
  });

  it("puts writing into writing", () => {
    expect(activityGroup("writing")).toBe("writing");
  });

  it("keeps other out of the three shown buckets", () => {
    expect(activityGroup("other")).toBe("other");
    expect(BREAKDOWN_GROUPS).not.toContain("other");
  });

  it("maps every activity type to exactly one group", () => {
    for (const type of ACTIVITY_TYPES) {
      expect(activityGroup(type)).toBeTypeOf("string");
    }
  });
});

describe("isActivityType", () => {
  it("accepts known types and rejects anything else", () => {
    expect(isActivityType("video")).toBe(true);
    expect(isActivityType("Video")).toBe(false);
    expect(isActivityType("meditation")).toBe(false);
    expect(isActivityType(null)).toBe(false);
    expect(isActivityType(7)).toBe(false);
  });
});

describe("timeable activities", () => {
  it("excludes speaking, which becomes a guided flow rather than a stopwatch", () => {
    expect(TIMEABLE_ACTIVITY_TYPES).not.toContain("speaking");
    expect(TIMEABLE_ACTIVITY_TYPES).toContain("conversation");
  });
});
