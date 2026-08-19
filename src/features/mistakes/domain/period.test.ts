import { describe, expect, it } from "vitest";
import {
  DEFAULT_MISTAKE_PERIOD,
  earliestInstantToLoad,
  filterToWindow,
  parseMistakePeriod,
  periodDays,
  periodWindow,
  previousPeriodWindow,
  withinWindow,
} from "./period";

/** Amsterdam is UTC+2 in August, so a local day starts at 22:00 the day before. */
const ZONE = "Europe/Amsterdam";
const NOW = new Date("2026-08-19T09:00:00Z");

describe("parseMistakePeriod", () => {
  it("accepts the three it knows", () => {
    expect(parseMistakePeriod("30d")).toBe("30d");
    expect(parseMistakePeriod("90d")).toBe("90d");
    expect(parseMistakePeriod("all")).toBe("all");
  });

  it("falls back to the default rather than erroring on a typed URL", () => {
    expect(parseMistakePeriod(undefined)).toBe(DEFAULT_MISTAKE_PERIOD);
    expect(parseMistakePeriod("year")).toBe(DEFAULT_MISTAKE_PERIOD);
    expect(parseMistakePeriod("")).toBe(DEFAULT_MISTAKE_PERIOD);
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(parseMistakePeriod(["90d", "30d"])).toBe("90d");
  });
});

describe("periodWindow", () => {
  it("starts at local midnight in the learner's own zone, not the server's", () => {
    const window = periodWindow("30d", NOW, ZONE)!;
    // 30 local days ending today: 21 July 00:00 local = 20 July 22:00 UTC.
    expect(window.from.toISOString()).toBe("2026-07-20T22:00:00.000Z");
    // Half-open, ending at the start of tomorrow local.
    expect(window.to.toISOString()).toBe("2026-08-19T22:00:00.000Z");
  });

  it("counts today as one of the days", () => {
    const window = periodWindow("30d", NOW, ZONE)!;
    const days = (window.to.getTime() - window.from.getTime()) / 86_400_000;
    expect(days).toBe(30);
    expect(withinWindow(NOW, window)).toBe(true);
  });

  it("puts a late-evening mistake in the day the learner was living in", () => {
    // 22:30 UTC on the 18th is 00:30 on the 19th in Amsterdam — inside today,
    // and it would have fallen outside a UTC-computed window.
    const window = periodWindow("30d", NOW, ZONE)!;
    expect(withinWindow(new Date("2026-08-18T22:30:00Z"), window)).toBe(true);

    // The same instant read in a zone behind UTC is still the 18th there.
    const utcWindow = periodWindow("30d", NOW, "UTC")!;
    expect(withinWindow(new Date("2026-07-20T23:00:00Z"), utcWindow)).toBe(false);
  });

  it("draws a 90-day window from the same edge", () => {
    const window = periodWindow("90d", NOW, ZONE)!;
    const days = (window.to.getTime() - window.from.getTime()) / 86_400_000;
    expect(days).toBe(90);
  });

  it("has no boundaries at all for all time", () => {
    expect(periodDays("all")).toBeNull();
    expect(periodWindow("all", NOW, ZONE)).toBeNull();
    expect(withinWindow(new Date("2019-01-01T00:00:00Z"), null)).toBe(true);
  });
});

describe("previousPeriodWindow", () => {
  it("is the same length again, immediately before", () => {
    const window = periodWindow("30d", NOW, ZONE)!;
    const previous = previousPeriodWindow("30d", NOW, ZONE)!;

    expect(previous.to.toISOString()).toBe(window.from.toISOString());
    expect((previous.to.getTime() - previous.from.getTime()) / 86_400_000).toBe(30);
  });

  it("does not exist for all time, so no trend is invented", () => {
    expect(previousPeriodWindow("all", NOW, ZONE)).toBeNull();
    expect(earliestInstantToLoad("all", NOW, ZONE)).toBeNull();
  });

  it("is where one read has to reach back to", () => {
    expect(earliestInstantToLoad("30d", NOW, ZONE)?.toISOString()).toBe(
      previousPeriodWindow("30d", NOW, ZONE)!.from.toISOString(),
    );
  });
});

describe("filterToWindow", () => {
  const items = [
    { createdAt: new Date("2026-08-19T08:00:00Z") },
    { createdAt: new Date("2026-06-01T08:00:00Z") },
  ];

  it("keeps only what falls inside", () => {
    expect(filterToWindow(items, periodWindow("30d", NOW, ZONE))).toHaveLength(1);
    expect(filterToWindow(items, periodWindow("90d", NOW, ZONE))).toHaveLength(2);
  });

  it("keeps everything when the window is all of time", () => {
    expect(filterToWindow(items, null)).toHaveLength(2);
  });
});
