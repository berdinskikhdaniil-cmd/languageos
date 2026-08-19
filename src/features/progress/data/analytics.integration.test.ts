import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { sessions, writingEntries, writingIssues, writingReviews } from "@/db/schema";
import type { OnboardedUser } from "@/lib/auth/current-user";
import { createTestAccount, deleteTestAccount, type TestAccount } from "@/test/db-fixtures";
import { getProgressAnalytics } from "./analytics";

/**
 * Progress analytics against the real database.
 *
 * The screen now reads two tables rather than one, so it has two ways to leak.
 * These tests hold both: study time is one account's own sessions, and the
 * mistake half stays scoped exactly as it was. They also check the seam that
 * only exists once real rows are involved — that a session and a review made on
 * the same local evening land in the same day of the same window.
 */

const ZONE = "Europe/Amsterdam";
const NOW = new Date("2026-08-19T09:00:00Z");
/** Inside the 30-day window, in the learner's own zone. */
const YESTERDAY = new Date("2026-08-18T08:00:00Z");
const LONG_AGO = new Date("2026-01-05T08:00:00Z");

let alice: TestAccount;
let bob: TestAccount;

function asUser(account: TestAccount): OnboardedUser {
  return {
    id: account.id,
    firstName: "Test",
    lastName: null,
    uiLanguage: "en",
    timeZone: ZONE,
    primaryLanguage: { id: account.languageId, code: "en", name: "English", dailyGoalMinutes: 45 },
    onboardingCompletedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

async function addSession({
  account,
  startedAt = YESTERDAY,
  minutes = 30,
  activityType = "video" as const,
}: {
  account: TestAccount;
  startedAt?: Date;
  minutes?: number;
  activityType?: "video" | "conversation" | "writing" | "other";
}) {
  await db.insert(sessions).values({
    userId: account.id,
    userLanguageId: account.languageId,
    activityType,
    startedAt,
    endedAt: new Date(startedAt.getTime() + minutes * 60_000),
    durationSeconds: minutes * 60,
  });
}

async function addReviewedWriting({
  account,
  createdAt = YESTERDAY,
  wordCount = 400,
  mistakes = 0,
}: {
  account: TestAccount;
  createdAt?: Date;
  wordCount?: number;
  mistakes?: number;
}) {
  const [entry] = await db
    .insert(writingEntries)
    .values({
      userId: account.id,
      userLanguageId: account.languageId,
      type: "free_writing",
      originalText: "Yesterday I go to the shop and I buyed some bread.",
      wordCount,
      createdAt,
    })
    .returning();

  const [review] = await db
    .insert(writingReviews)
    .values({
      entryId: entry.id,
      status: "completed",
      model: "test/model",
      summary: "Clear enough.",
      improvedText: "Yesterday I went to the shop and bought some bread.",
    })
    .returning();

  if (mistakes > 0) {
    await db.insert(writingIssues).values(
      Array.from({ length: mistakes }, (_, position) => ({
        reviewId: review.id,
        position,
        category: "grammar" as const,
        label: "past tense",
        severity: "error" as const,
        originalFragment: "I go",
        suggestion: "I went",
        explanation: "Yesterday needs the past tense.",
      })),
    );
  }
}

beforeAll(async () => {
  alice = await createTestAccount("Alice", { timeZone: ZONE, dailyGoalMinutes: 45 });
  bob = await createTestAccount("Bob", { timeZone: ZONE, dailyGoalMinutes: 45 });
});

afterAll(async () => {
  await deleteTestAccount(alice);
  await deleteTestAccount(bob);
});

beforeEach(async () => {
  for (const account of [alice, bob]) {
    await db.delete(sessions).where(eq(sessions.userId, account.id));
    await db.delete(writingEntries).where(eq(writingEntries.userId, account.id));
  }
});

describe("whose progress it is", () => {
  it("counts only the caller's own study time", async () => {
    await addSession({ account: alice, minutes: 30 });
    await addSession({ account: bob, minutes: 90 });

    const analytics = await getProgressAnalytics(asUser(alice), "30d", NOW);

    expect(analytics.activity.summary.seconds).toBe(30 * 60);
    expect(analytics.activity.summary.activeDays).toBe(1);
    expect(analytics.consistency.activeDays).toBe(1);
  });

  it("shows an account with nothing an empty screen rather than somebody else's", async () => {
    await addSession({ account: alice, minutes: 30 });
    await addReviewedWriting({ account: alice, mistakes: 2 });

    const analytics = await getProgressAnalytics(asUser(bob), "30d", NOW);

    expect(analytics.hasAnything).toBe(false);
    expect(analytics.activity.summary.seconds).toBe(0);
    expect(analytics.mistakes.counts.mistakes).toBe(0);
    expect(analytics.quality.points).toEqual([]);
  });
});

describe("the window the screen says it is showing", () => {
  it("leaves out sessions from before it", async () => {
    await addSession({ account: alice, startedAt: LONG_AGO, minutes: 60 });
    await addSession({ account: alice, startedAt: YESTERDAY, minutes: 30 });

    const thirty = await getProgressAnalytics(asUser(alice), "30d", NOW);
    expect(thirty.activity.summary.seconds).toBe(30 * 60);
    expect(thirty.activity.buckets).toHaveLength(30);

    const all = await getProgressAnalytics(asUser(alice), "all", NOW);
    expect(all.activity.summary.seconds).toBe(90 * 60);
    // January to August is more than a season, so months rather than 227 bars.
    expect(all.granularity).toBe("month");
    expect(all.activity.buckets.length).toBeLessThan(12);
  });

  it("keeps the heatmap on its own twelve weeks whatever is selected", async () => {
    await addSession({ account: alice, startedAt: YESTERDAY, minutes: 30 });

    for (const period of ["30d", "90d", "all"] as const) {
      const analytics = await getProgressAnalytics(asUser(alice), period, NOW);
      expect(analytics.consistency.weeks).toHaveLength(12);
      expect(analytics.consistency.activeDays).toBe(1);
    }
  });
});

describe("what the numbers are made of", () => {
  it("splits real sessions into the tracker's groups", async () => {
    await addSession({ account: alice, minutes: 60, activityType: "video" });
    await addSession({ account: alice, minutes: 20, activityType: "conversation" });
    await addSession({ account: alice, minutes: 20, activityType: "writing" });

    const { balance } = await getProgressAnalytics(asUser(alice), "30d", NOW);

    expect(balance.totalSeconds).toBe(100 * 60);
    expect(balance.shares).toEqual([
      { group: "input", seconds: 3600, percent: 60 },
      { group: "speaking", seconds: 1200, percent: 20 },
      { group: "writing", seconds: 1200, percent: 20 },
    ]);
  });

  it("builds the quality line from reviewed writing only", async () => {
    // Two separate local weeks, each with enough words to divide by.
    await addReviewedWriting({
      account: alice,
      createdAt: new Date("2026-08-11T10:00:00Z"),
      wordCount: 500,
      mistakes: 5,
    });
    await addReviewedWriting({
      account: alice,
      createdAt: new Date("2026-08-18T10:00:00Z"),
      wordCount: 500,
      mistakes: 1,
    });

    const { quality } = await getProgressAnalytics(asUser(alice), "30d", NOW);

    expect(quality.points.map((point) => point.perThousand)).toEqual([10, 2]);
    expect(quality.thinBuckets).toBe(0);
  });

  it("leaves a week of forty words out of the line rather than plotting noise", async () => {
    await addReviewedWriting({
      account: alice,
      createdAt: new Date("2026-08-11T10:00:00Z"),
      wordCount: 40,
      mistakes: 3,
    });

    const { quality } = await getProgressAnalytics(asUser(alice), "30d", NOW);

    expect(quality.points).toEqual([]);
    expect(quality.thinBuckets).toBe(1);
  });

  it("counts a late-evening session towards the learner's own day", async () => {
    // 22:30 UTC is 00:30 the next morning in Amsterdam.
    await addSession({
      account: alice,
      startedAt: new Date("2026-08-18T22:30:00Z"),
      minutes: 20,
    });
    await addSession({
      account: alice,
      startedAt: new Date("2026-08-19T08:00:00Z"),
      minutes: 20,
    });

    const analytics = await getProgressAnalytics(asUser(alice), "30d", NOW);

    // Both are the 19th locally: one active day, and one bar carrying both.
    expect(analytics.activity.summary.activeDays).toBe(1);
    expect(analytics.activity.buckets[analytics.activity.buckets.length - 1].seconds).toBe(
      40 * 60,
    );
  });
});
