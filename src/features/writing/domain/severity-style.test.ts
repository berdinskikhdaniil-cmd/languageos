import { describe, expect, it } from "vitest";
import { HIGHLIGHT_BASE_CLASS, severityStyle } from "./severity-style";
import { ISSUE_SEVERITIES } from "./review";

describe("what each severity looks like", () => {
  it("gives a mistake the red tone", () => {
    const style = severityStyle("error");
    expect(style.highlight).toContain("severity-error");
    expect(style.highlightSelected).toContain("severity-error");
    expect(style.quote).toBe("text-severity-error");
  });

  it("gives something awkward the amber tone", () => {
    expect(severityStyle("awkward").highlight).toContain("severity-awkward");
    expect(severityStyle("awkward").quote).toBe("text-severity-awkward");
  });

  it("gives a matter of style the neutral tone", () => {
    expect(severityStyle("style").highlight).toContain("severity-style");
    expect(severityStyle("style").quote).toBe("text-severity-style");
  });

  it("covers every severity there is", () => {
    for (const severity of ISSUE_SEVERITIES) {
      const style = severityStyle(severity);
      expect(style.highlight).not.toBe("");
      expect(style.highlightSelected).not.toBe("");
      expect(style.quote).not.toBe("");
    }
  });
});

describe("the three tones", () => {
  it("are distinct, so severity is readable at a glance", () => {
    const tones = ISSUE_SEVERITIES.map((severity) => severityStyle(severity).quote);
    expect(new Set(tones).size).toBe(ISSUE_SEVERITIES.length);
  });

  it("come from tokens, never from a hex value in a component", () => {
    for (const severity of ISSUE_SEVERITIES) {
      const style = severityStyle(severity);
      for (const value of Object.values(style)) {
        expect(value).not.toMatch(/#[0-9a-f]{3,8}/i);
        expect(value).not.toMatch(/rgb|hsl/i);
      }
    }
  });

  it("are stronger when selected than when not", () => {
    for (const severity of ISSUE_SEVERITIES) {
      const { highlight, highlightSelected } = severityStyle(severity);
      const opacity = (value: string) => Number(/\/(\d+)/.exec(value)?.[1] ?? 0);
      expect(opacity(highlightSelected)).toBeGreaterThan(opacity(highlight));
    }
  });
});

describe("what every highlight shares", () => {
  it("carries an underline, so colour is never the only signal", () => {
    expect(HIGHLIGHT_BASE_CLASS).toContain("underline");
  });

  it("shows it can be tapped", () => {
    expect(HIGHLIGHT_BASE_CLASS).toContain("cursor-pointer");
  });
});
