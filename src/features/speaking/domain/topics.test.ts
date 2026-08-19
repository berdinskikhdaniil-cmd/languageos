import { describe, expect, it } from "vitest";
import { SUPPORTED_LANGUAGES } from "@/features/onboarding/domain/languages";
import { findTopic, pickTopic, speakingAvailableFor, topicsFor } from "./topics";

/**
 * The topic bank, and the honesty rule around it.
 *
 * A topic is the sentence the learner has to answer, so it has to be in the
 * language they are learning. We have those sentences for one language. The
 * tests below exist mostly to stop that quietly becoming "English prompts for
 * everybody".
 */

describe("which languages can practise speaking", () => {
  it("is English, today", () => {
    expect(speakingAvailableFor("en")).toBe(true);
  });

  it("is nobody else, and says so rather than handing out English prompts", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      if (language.code === "en") continue;
      expect(speakingAvailableFor(language.code), language.code).toBe(false);
      expect(topicsFor(language.code), language.code).toEqual([]);
    }
  });

  it("does not fall back for an unknown code", () => {
    expect(speakingAvailableFor("zz")).toBe(false);
    expect(speakingAvailableFor("")).toBe(false);
  });

  it("reads a code the way a stored one might arrive", () => {
    expect(speakingAvailableFor(" EN ")).toBe(true);
  });
});

describe("the English bank", () => {
  const topics = topicsFor("en");

  it("has enough to keep the exercise from repeating itself", () => {
    expect(topics.length).toBeGreaterThanOrEqual(20);
  });

  it("gives every topic a stable key, and no two the same", () => {
    const keys = topics.map((topic) => topic.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z0-9-]+$/);
  });

  it("asks a real question in each one", () => {
    for (const topic of topics) {
      expect(topic.prompt.length, topic.key).toBeGreaterThan(20);
      expect(topic.prompt.trim().endsWith("?") || topic.prompt.trim().endsWith("."), topic.key).toBe(
        true,
      );
    }
  });

  it("finds one by key, and refuses one from another language", () => {
    expect(findTopic("en", "yesterday")).toMatchObject({ key: "yesterday" });
    expect(findTopic("en", "not-a-topic")).toBeNull();
    // The key exists, but not for a Spanish learner — who has no bank at all.
    expect(findTopic("es", "yesterday")).toBeNull();
  });
});

describe("choosing one to answer", () => {
  it("returns a topic from the bank", () => {
    const topic = pickTopic("en", { random: () => 0 });
    expect(topic).toEqual(topicsFor("en")[0]);
  });

  it("never returns the one already on screen", () => {
    const topics = topicsFor("en");

    for (const excluded of topics) {
      // Every position in the remaining pool, so no index can slip through.
      for (const fraction of [0, 0.25, 0.5, 0.75, 0.999]) {
        const picked = pickTopic("en", { exclude: excluded.key, random: () => fraction });
        expect(picked?.key, `${excluded.key}@${fraction}`).not.toBe(excluded.key);
      }
    }
  });

  it("stays inside the array however the random number lands", () => {
    // A random() of exactly 1 is out of contract but must not return undefined.
    for (const fraction of [0, 0.999999, 1, -0.5]) {
      expect(pickTopic("en", { random: () => fraction })).not.toBeNull();
    }
  });

  it("returns nothing for a language with no bank", () => {
    expect(pickTopic("es")).toBeNull();
  });
});
