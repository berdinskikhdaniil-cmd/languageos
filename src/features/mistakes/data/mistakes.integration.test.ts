import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  speakingAttempts,
  speakingIssues,
  speakingReviews,
  userLanguages,
  writingEntries,
  writingIssues,
  writingReviews,
} from "@/db/schema";
import type { IssueSeverity } from "@/features/writing/domain/review";
import type { OnboardedUser } from "@/lib/auth/current-user";
import { createTestAccount, deleteTestAccount, type TestAccount } from "@/test/db-fixtures";
import { getMistakeOccurrences, getMistakeOverview, loadMistakeWorkload } from "./mistakes";

/**
 * The mistake engine against the real database.
 *
 * Two things are being held here and both are about ownership. One user's weak
 * points must never contain another's — not in the occurrences, not in the
 * counts, and not in the repeated-skill grouping, which is where a leak would
 * be hardest to spot because it only shows up as a number that is too big. And
 * a second language on the *same* account is just as separate: somebody
 * studying German has German weak points, and their English ones are not part
 * of that picture.
 */

const ZONE = "Europe/Amsterdam";
const NOW = new Date("2026-08-19T09:00:00Z");
const TODAY = new Date("2026-08-19T08:00:00Z");
const LONG_AGO = new Date("2026-01-05T08:00:00Z");

let alice: TestAccount;
let bob: TestAccount;
/** Alice's second language. Same account, different picture. */
let aliceGerman: string;

function asUser(account: TestAccount, languageId = account.languageId): OnboardedUser {
  return {
    id: account.id,
    firstName: "Test",
    lastName: null,
    uiLanguage: "en",
    timeZone: ZONE,
    primaryLanguage: { id: languageId, code: "en", name: "English", dailyGoalMinutes: 30 },
    onboardingCompletedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

async function addWriting({
  account,
  languageId,
  wordCount = 200,
  createdAt = TODAY,
  status = "completed",
  summary = "Clear enough. Watch your past tenses.",
  improvedText = "Yesterday I went to the shop and bought some bread.",
  issues = [] as { label: string | null; severity?: IssueSeverity }[],
}: {
  account: TestAccount;
  languageId?: string;
  wordCount?: number;
  createdAt?: Date;
  status?: "pending" | "completed" | "failed";
  summary?: string | null;
  improvedText?: string | null;
  issues?: { label: string | null; severity?: IssueSeverity }[];
}): Promise<{ entryId: string }> {
  const [entry] = await db
    .insert(writingEntries)
    .values({
      userId: account.id,
      userLanguageId: languageId ?? account.languageId,
      type: "free_writing",
      originalText: "Yesterday I go to the shop and I buyed some bread.",
      wordCount,
      createdAt,
    })
    .returning();

  const [review] = await db
    .insert(writingReviews)
    .values({ entryId: entry.id, status, model: "test/model", summary, improvedText })
    .returning();

  if (issues.length > 0) {
    await db.insert(writingIssues).values(
      issues.map((issue, position) => ({
        reviewId: review.id,
        position,
        category: "grammar" as const,
        label: issue.label,
        severity: issue.severity ?? ("error" as const),
        originalFragment: "I go",
        suggestion: "I went",
        explanation: "Yesterday needs the past tense.",
      })),
    );
  }

  return { entryId: entry.id };
}

async function addSpeaking({
  account,
  languageId,
  createdAt = TODAY,
  status = "completed",
  issues = [] as { label: string | null; severity?: IssueSeverity }[],
}: {
  account: TestAccount;
  languageId?: string;
  createdAt?: Date;
  status?: "pending" | "completed" | "failed";
  issues?: { label: string | null; severity?: IssueSeverity }[];
}): Promise<{ attemptId: string }> {
  const [attempt] = await db
    .insert(speakingAttempts)
    .values({
      userId: account.id,
      userLanguageId: languageId ?? account.languageId,
      clientRequestId: `req-${Math.random().toString(36).slice(2)}`,
      topicKey: "weekend",
      topicPrompt: "What did you do at the weekend?",
      status: "completed",
      durationSeconds: 40,
      transcript: "Yesterday I go to the park with my friend.",
      createdAt,
    })
    .returning();

  const [review] = await db
    .insert(speakingReviews)
    .values({
      attemptId: attempt.id,
      status,
      model: "test/model",
      summary: "Easy to follow.",
      improvedAnswer: "Yesterday I went to the park with my friend.",
    })
    .returning();

  if (issues.length > 0) {
    await db.insert(speakingIssues).values(
      issues.map((issue, position) => ({
        reviewId: review.id,
        position,
        category: "grammar" as const,
        label: issue.label,
        severity: issue.severity ?? ("error" as const),
        originalFragment: "I go",
        suggestion: "I went",
        explanation: "Yesterday needs the past tense.",
      })),
    );
  }

  return { attemptId: attempt.id };
}

beforeAll(async () => {
  alice = await createTestAccount("Alice", { timeZone: ZONE });
  bob = await createTestAccount("Bob", { timeZone: ZONE });

  const [german] = await db
    .insert(userLanguages)
    .values({
      userId: alice.id,
      languageCode: "de",
      languageName: "German",
      isPrimary: false,
    })
    .returning();

  aliceGerman = german.id;
});

afterAll(async () => {
  await deleteTestAccount(alice);
  await deleteTestAccount(bob);
});

beforeEach(async () => {
  for (const account of [alice, bob]) {
    await db.delete(writingEntries).where(eq(writingEntries.userId, account.id));
    await db.delete(speakingAttempts).where(eq(speakingAttempts.userId, account.id));
  }
});

describe("who a learner's mistakes belong to", () => {
  it("gives Alice her own writing issues", async () => {
    const { entryId } = await addWriting({ account: alice, issues: [{ label: "past tense" }] });

    const workload = await loadMistakeWorkload({
      userId: alice.id,
      userLanguageId: alice.languageId,
      languageCode: "en",
    });

    expect(workload.occurrences).toHaveLength(1);
    expect(workload.occurrences[0]).toMatchObject({
      source: "writing",
      sourceId: entryId,
      label: "past tense",
      severity: "error",
    });
  });

  it("gives Alice her own speaking issues", async () => {
    const { attemptId } = await addSpeaking({ account: alice, issues: [{ label: "articles" }] });

    const workload = await loadMistakeWorkload({
      userId: alice.id,
      userLanguageId: alice.languageId,
      languageCode: "en",
    });

    expect(workload.occurrences).toHaveLength(1);
    expect(workload.occurrences[0]).toMatchObject({ source: "speaking", sourceId: attemptId });
  });

  it("gives Bob none of Alice's, from either source", async () => {
    await addWriting({ account: alice, issues: [{ label: "past tense" }] });
    await addSpeaking({ account: alice, issues: [{ label: "articles" }] });

    const workload = await loadMistakeWorkload({
      userId: bob.id,
      userLanguageId: bob.languageId,
      languageCode: "en",
    });

    expect(workload).toEqual({ occurrences: [], writing: [], speaking: [] });
  });

  it("never lets one account's repeated skills swell another's", async () => {
    await addWriting({
      account: alice,
      issues: [{ label: "past tense" }, { label: "past tense" }],
    });
    await addWriting({
      account: bob,
      issues: [{ label: "past tense" }, { label: "past tense" }, { label: "past tense" }],
    });

    const overview = await getMistakeOverview(asUser(bob), "30d", NOW);

    expect(overview.repeated).toHaveLength(1);
    expect(overview.repeated[0]).toMatchObject({ key: "past tense", mistakes: 3 });
    expect(overview.counts.mistakes).toBe(3);
  });

  it("only ever points at work its own owner did", async () => {
    const mine = await addWriting({ account: alice, issues: [{ label: "past tense" }] });
    await addWriting({ account: bob, issues: [{ label: "past tense" }] });

    const occurrences = await getMistakeOccurrences(
      asUser(alice),
      "30d",
      { kind: "skill", key: "past tense" },
      NOW,
    );

    expect(occurrences.map((item) => item.sourceId)).toEqual([mine.entryId]);

    const owned = await db
      .select({ userId: writingEntries.userId })
      .from(writingEntries)
      .where(eq(writingEntries.id, occurrences[0].sourceId));

    expect(owned[0].userId).toBe(alice.id);
  });
});

describe("a second language on the same account", () => {
  it("is a separate picture, not part of the primary one", async () => {
    await addWriting({ account: alice, issues: [{ label: "past tense" }] });
    await addWriting({
      account: alice,
      languageId: aliceGerman,
      issues: [{ label: "noun case" }, { label: "noun case" }],
    });

    const english = await getMistakeOverview(asUser(alice), "30d", NOW);
    expect(english.counts.mistakes).toBe(1);
    expect(english.repeated).toEqual([]);

    const german = await getMistakeOverview(asUser(alice, aliceGerman), "30d", NOW);
    expect(german.counts.mistakes).toBe(2);
    expect(german.repeated[0]).toMatchObject({ key: "noun case", mistakes: 2 });
  });
});

describe("what counts as data", () => {
  it("ignores a review that never finished", async () => {
    await addWriting({
      account: alice,
      status: "pending",
      summary: null,
      improvedText: null,
      issues: [{ label: "past tense" }],
    });

    const overview = await getMistakeOverview(asUser(alice), "30d", NOW);

    expect(overview.counts.mistakes).toBe(0);
    // And, crucially, its words are not in the denominator either: a review
    // that did not happen is missing data, not a clean piece of writing.
    expect(overview.writingReviewed).toBe(0);
    expect(overview.accuracy.current).toEqual({ status: "insufficient", words: 0 });
  });

  it("ignores a review that failed", async () => {
    await addWriting({
      account: alice,
      status: "failed",
      summary: null,
      improvedText: null,
      issues: [{ label: "past tense" }],
    });
    await addSpeaking({ account: alice, status: "failed", issues: [{ label: "articles" }] });

    const overview = await getMistakeOverview(asUser(alice), "30d", NOW);

    expect(overview.counts.mistakes).toBe(0);
    expect(overview.hasReviewedWork).toBe(false);
  });

  it("ignores a completed review holding nothing a learner could use", async () => {
    // The exact historical production row: schema-valid, and empty of meaning.
    await addWriting({
      account: alice,
      summary: ":",
      improvedText: ":",
      issues: [{ label: "past tense" }],
    });

    const overview = await getMistakeOverview(asUser(alice), "30d", NOW);
    expect(overview.hasReviewedWork).toBe(false);
  });

  it("keeps a clean reviewed entry in the denominator", async () => {
    await addWriting({ account: alice, wordCount: 300, issues: [] });

    const overview = await getMistakeOverview(asUser(alice), "30d", NOW);

    expect(overview.hasReviewedWork).toBe(true);
    expect(overview.accuracy.current).toEqual({
      status: "ready",
      perThousand: 0,
      mistakes: 0,
      words: 300,
    });
  });
});

describe("periods, in the learner's own zone", () => {
  it("leaves out work from before the window", async () => {
    await addWriting({ account: alice, createdAt: LONG_AGO, issues: [{ label: "past tense" }] });
    await addSpeaking({ account: alice, createdAt: TODAY, issues: [{ label: "articles" }] });

    const thirty = await getMistakeOverview(asUser(alice), "30d", NOW);
    expect(thirty.counts.mistakes).toBe(1);
    expect(thirty.writingReviewed).toBe(0);

    const all = await getMistakeOverview(asUser(alice), "all", NOW);
    expect(all.counts.mistakes).toBe(2);
    expect(all.writingReviewed).toBe(1);
  });

  it("merges both sources into one list, newest first", async () => {
    await addWriting({
      account: alice,
      createdAt: new Date("2026-08-10T08:00:00Z"),
      issues: [{ label: "past tense" }],
    });
    await addSpeaking({
      account: alice,
      createdAt: new Date("2026-08-18T08:00:00Z"),
      issues: [{ label: "articles" }],
    });

    const overview = await getMistakeOverview(asUser(alice), "30d", NOW);

    expect(overview.recent.map((item) => item.source)).toEqual(["speaking", "writing"]);
    expect(overview.balance).toEqual({ writing: 1, speaking: 1 });
  });
});
