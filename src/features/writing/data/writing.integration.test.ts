import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { userLanguages, writingEntries, writingIssues, writingReviews } from "@/db/schema";
import type { OnboardedUser } from "@/lib/auth/current-user";
import { isUsableReviewContent } from "../domain/review";
import { createTestAccount, deleteTestAccount, type TestAccount } from "@/test/db-fixtures";
import {
  createWritingEntry,
  getRecentWritingEntries,
  getWritingEntry,
  saveRewrite,
} from "./entries";
import { runReview } from "./review-runner";
import { ageReviewForTesting, readReview } from "./reviews";

/**
 * Writing against the real database.
 *
 * The provider is stubbed at `fetch` — these tests are about ownership,
 * transactions and the review lifecycle, and none of them should cost money or
 * depend on a model being up.
 */

const ORIGINAL =
  "Yesterday I go to the shop and I buyed some bread. The bread was very delicious.";

let alice: TestAccount;
let bob: TestAccount;
let fetchMock: ReturnType<typeof vi.fn>;

function asUser(account: TestAccount, firstName: string): OnboardedUser {
  return {
    id: account.id,
    firstName,
    lastName: null,
    uiLanguage: "en",
    timeZone: "Europe/Amsterdam",
    primaryLanguage: {
      id: account.languageId,
      code: "en",
      name: "English",
      dailyGoalMinutes: 30,
    },
    onboardingCompletedAt: new Date("2026-08-01T00:00:00Z"),
  };
}

const REVIEW_PAYLOAD = {
  summary: "Clear and readable. Watch your past tenses.",
  improvedText: "Yesterday I went to the shop and I bought some bread. The bread was delicious.",
  issues: [
    {
      category: "grammar",
      label: "past tense",
      severity: "error",
      originalFragment: "I go to the shop",
      suggestion: "I went to the shop",
      explanation: "Yesterday needs the past tense.",
      // An offset the model volunteered, which we must ignore entirely.
      startOffset: 999,
    },
    {
      category: "spelling",
      label: null,
      severity: "error",
      originalFragment: "buyed",
      suggestion: "bought",
      explanation: "The past tense of buy is bought.",
    },
    {
      category: "naturalness",
      label: "intensifier",
      severity: "awkward",
      // Not present in the text: the model paraphrased. It must survive without
      // a highlight rather than sink the review.
      originalFragment: "was extremely delicious",
      suggestion: "was delicious",
      explanation: "Delicious already means very tasty.",
    },
  ],
};

/**
 * A fresh Response every call: a body can only be read once, so a mock that
 * hands back the same object makes the second call look like a broken provider.
 */
function providerAnswers(payload: unknown = REVIEW_PAYLOAD) {
  return new Response(
    JSON.stringify({
      model: "test/model-v1",
      choices: [{ message: { content: JSON.stringify(payload) } }],
      usage: { prompt_tokens: 210, completion_tokens: 180 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function providerFails(status: number, message: string) {
  return new Response(JSON.stringify({ error: { code: status, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeAll(async () => {
  alice = await createTestAccount("Alice");
  bob = await createTestAccount("Bob");
});

afterAll(async () => {
  await deleteTestAccount(alice);
  await deleteTestAccount(bob);
});

beforeEach(async () => {
  await db.delete(writingEntries).where(eq(writingEntries.userId, alice.id));
  await db.delete(writingEntries).where(eq(writingEntries.userId, bob.id));

  vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
  vi.stubEnv("OPENROUTER_MODEL", "test/model");
  fetchMock = vi.fn(async () => providerAnswers());
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function entryFor(account: TestAccount, text = ORIGINAL) {
  return createWritingEntry({
    userId: account.id,
    userLanguageId: account.languageId,
    type: "free_writing",
    originalText: text,
    wordCount: 16,
  });
}

describe("ownership", () => {
  it("does not show Bob Alice's writing, even with the right id", async () => {
    const entry = await entryFor(alice);

    expect((await getWritingEntry(entry.id, alice.id))?.entry.id).toBe(entry.id);
    // Not found and not yours are deliberately the same answer.
    expect(await getWritingEntry(entry.id, bob.id)).toBeNull();
  });

  it("does not let Bob review Alice's writing", async () => {
    const entry = await entryFor(alice);
    const detail = await getWritingEntry(entry.id, bob.id);

    expect(detail).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not let Bob rewrite Alice's writing", async () => {
    const entry = await entryFor(alice);

    expect(await saveRewrite({ entryId: entry.id, userId: bob.id, revisedText: "Mine now." })).toBeNull();

    const [after] = await db.select().from(writingEntries).where(eq(writingEntries.id, entry.id));
    expect(after.revisedText).toBeNull();
    expect(after.originalText).toBe(ORIGINAL);
  });

  it("cannot file writing against another user's language", async () => {
    // Enforced by the composite foreign key on (user_id, user_language_id).
    await expect(
      createWritingEntry({
        userId: bob.id,
        userLanguageId: alice.languageId,
        type: "free_writing",
        originalText: ORIGINAL,
        wordCount: 16,
      }),
    ).rejects.toThrow();

    const rows = await db.select().from(writingEntries).where(eq(writingEntries.userId, bob.id));
    expect(rows).toEqual([]);
  });
});

describe("a review that works", () => {
  it("stores the summary, the improved version and every issue", async () => {
    const entry = await entryFor(alice);
    const outcome = await runReview({ entry, user: asUser(alice, "Alice") });

    expect(outcome).toEqual({ ok: true, alreadyComplete: false });

    const detail = await getWritingEntry(entry.id, alice.id);
    expect(detail?.review).toMatchObject({
      status: "completed",
      summary: REVIEW_PAYLOAD.summary,
      improvedText: REVIEW_PAYLOAD.improvedText,
      model: "test/model-v1",
      failureReason: null,
    });
    expect(detail?.issues).toHaveLength(3);
  });

  it("records the token usage the provider reported", async () => {
    const entry = await entryFor(alice);
    await runReview({ entry, user: asUser(alice, "Alice") });

    const review = await readReview(entry.id);
    expect(review).toMatchObject({ inputTokens: 210, outputTokens: 180 });
  });

  it("resolves offsets itself and ignores any the model volunteered", async () => {
    const entry = await entryFor(alice);
    await runReview({ entry, user: asUser(alice, "Alice") });

    const detail = await getWritingEntry(entry.id, alice.id);
    const [first, second, third] = detail!.issues;

    // Computed from the stored text, not taken from the payload's 999.
    expect(ORIGINAL.slice(first.startOffset!, first.endOffset!)).toBe("I go to the shop");
    expect(ORIGINAL.slice(second.startOffset!, second.endOffset!)).toBe("buyed");
    // The paraphrased fragment keeps everything except its highlight.
    expect(third.startOffset).toBeNull();
    expect(third.endOffset).toBeNull();
    expect(third.suggestion).toBe("was delicious");
  });

  it("keeps the issues in the order the review gave them", async () => {
    const entry = await entryFor(alice);
    await runReview({ entry, user: asUser(alice, "Alice") });

    const detail = await getWritingEntry(entry.id, alice.id);
    expect(detail?.issues.map((issue) => issue.position)).toEqual([0, 1, 2]);
    expect(detail?.issues.map((issue) => issue.category)).toEqual([
      "grammar",
      "spelling",
      "naturalness",
    ]);
  });

  it("never alters the text it reviewed", async () => {
    const entry = await entryFor(alice);
    await runReview({ entry, user: asUser(alice, "Alice") });

    const detail = await getWritingEntry(entry.id, alice.id);
    expect(detail?.entry.originalText).toBe(ORIGINAL);
  });
});

describe("a review that fails", () => {
  it("keeps the writing and records the failure", async () => {
    fetchMock.mockImplementation(async () => providerFails(429, "rate limited"));
    const entry = await entryFor(alice);

    const outcome = await runReview({ entry, user: asUser(alice, "Alice") });
    expect(outcome).toEqual({ ok: false, reason: "rate_limited" });

    const detail = await getWritingEntry(entry.id, alice.id);
    // The whole point: the draft survives.
    expect(detail?.entry.originalText).toBe(ORIGINAL);
    expect(detail?.review).toMatchObject({ status: "failed", failureReason: "rate_limited" });
    expect(detail?.issues).toEqual([]);
  });

  it("keeps the writing when the provider answers with unusable JSON", async () => {
    fetchMock.mockImplementation(async () => providerAnswers({ summary: "Nice", issues: "lots" }));
    const entry = await entryFor(alice);

    expect(await runReview({ entry, user: asUser(alice, "Alice") })).toEqual({
      ok: false,
      reason: "invalid_response",
    });
    expect((await readReview(entry.id))?.status).toBe("failed");
  });

  it("writes no review row at all when the provider is not configured", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const entry = await entryFor(alice);

    expect(await runReview({ entry, user: asUser(alice, "Alice") })).toEqual({
      ok: false,
      reason: "not_configured",
    });
    // An operator's mistake must not leave debris, or spend the daily allowance.
    expect(await readReview(entry.id)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is retried on the same entry and the same review row", async () => {
    fetchMock.mockImplementation(async () => providerFails(503, "no provider available"));
    const entry = await entryFor(alice);
    await runReview({ entry, user: asUser(alice, "Alice") });

    const failed = await readReview(entry.id);
    expect(failed?.status).toBe("failed");

    fetchMock.mockImplementation(async () => providerAnswers());
    expect(await runReview({ entry, user: asUser(alice, "Alice") })).toEqual({
      ok: true,
      alreadyComplete: false,
    });

    const retried = await readReview(entry.id);
    expect(retried?.id).toBe(failed?.id);
    expect(retried?.status).toBe("completed");
    expect(retried?.failureReason).toBeNull();

    // One entry, one review, one set of issues.
    const entries = await db.select().from(writingEntries).where(eq(writingEntries.userId, alice.id));
    expect(entries).toHaveLength(1);
    const issues = await db.select().from(writingIssues).where(eq(writingIssues.reviewId, retried!.id));
    expect(issues).toHaveLength(3);
  });
});

describe("asking twice", () => {
  it("reuses a completed review instead of paying for it again", async () => {
    const entry = await entryFor(alice);
    await runReview({ entry, user: asUser(alice, "Alice") });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(await runReview({ entry, user: asUser(alice, "Alice") })).toEqual({
      ok: true,
      alreadyComplete: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("calls the provider once when two requests race", async () => {
    const entry = await entryFor(alice);

    const [first, second] = await Promise.all([
      runReview({ entry, user: asUser(alice, "Alice") }),
      runReview({ entry, user: asUser(alice, "Alice") }),
    ]);

    // One did the work; the other was told it was already under way, or that it
    // was already done. Either way, one call and one set of results.
    const outcomes = [first, second];
    expect(outcomes.filter((outcome) => outcome.ok && !outcome.alreadyComplete)).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const reviews = await db.select().from(writingReviews).where(eq(writingReviews.entryId, entry.id));
    expect(reviews).toHaveLength(1);

    const issues = await db.select().from(writingIssues).where(eq(writingIssues.reviewId, reviews[0].id));
    expect(issues).toHaveLength(3);
  });

  it("refuses to start again while one is genuinely in flight", async () => {
    const entry = await entryFor(alice);
    // Leave a fresh pending claim behind, as a request still waiting would.
    fetchMock.mockImplementation(async () => providerFails(503, "down"));
    await runReview({ entry, user: asUser(alice, "Alice") });
    await db
      .update(writingReviews)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(writingReviews.entryId, entry.id));

    fetchMock.mockClear();
    expect(await runReview({ entry, user: asUser(alice, "Alice") })).toEqual({
      ok: false,
      reason: "processing",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("takes over a claim that was abandoned mid-call", async () => {
    const entry = await entryFor(alice);
    fetchMock.mockImplementation(async () => providerFails(503, "down"));
    await runReview({ entry, user: asUser(alice, "Alice") });

    const review = await readReview(entry.id);
    await db
      .update(writingReviews)
      .set({ status: "pending" })
      .where(eq(writingReviews.id, review!.id));
    // The function that owned it died ten minutes ago.
    await ageReviewForTesting(review!.id, new Date(Date.now() - 10 * 60 * 1000));

    fetchMock.mockImplementation(async () => providerAnswers());
    expect(await runReview({ entry, user: asUser(alice, "Alice") })).toEqual({
      ok: true,
      alreadyComplete: false,
    });
  });

  it("replaces the issues rather than stacking a second set on top", async () => {
    const entry = await entryFor(alice);
    await runReview({ entry, user: asUser(alice, "Alice") });

    // Force a genuine second run over the same review row.
    const review = await readReview(entry.id);
    await db
      .update(writingReviews)
      .set({ status: "failed" })
      .where(eq(writingReviews.id, review!.id));

    await runReview({ entry, user: asUser(alice, "Alice") });

    const issues = await db.select().from(writingIssues).where(eq(writingIssues.reviewId, review!.id));
    expect(issues).toHaveLength(3);
  });
});

describe("the daily allowance", () => {
  it("stops a new review once it is used up, and keeps the writing", async () => {
    vi.stubEnv("WRITING_DAILY_REVIEW_LIMIT", "2");
    const user = asUser(alice, "Alice");

    for (let index = 0; index < 2; index += 1) {
      await runReview({ entry: await entryFor(alice, `${ORIGINAL} Number ${index}.`), user });
    }

    const third = await entryFor(alice, `${ORIGINAL} One more.`);
    expect(await runReview({ entry: third, user })).toEqual({
      ok: false,
      reason: "limit_reached",
    });

    expect((await getWritingEntry(third.id, alice.id))?.entry.originalText).toContain("One more.");
    expect(await readReview(third.id)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("still lets an already-started review be retried", async () => {
    vi.stubEnv("WRITING_DAILY_REVIEW_LIMIT", "1");
    const user = asUser(alice, "Alice");

    fetchMock.mockImplementation(async () => providerFails(503, "down"));
    const entry = await entryFor(alice);
    await runReview({ entry, user });

    // A bad afternoon at the provider must not cost the learner their day.
    fetchMock.mockImplementation(async () => providerAnswers());
    expect(await runReview({ entry, user })).toEqual({ ok: true, alreadyComplete: false });
  });

  it("counts each learner separately", async () => {
    vi.stubEnv("WRITING_DAILY_REVIEW_LIMIT", "1");

    await runReview({ entry: await entryFor(alice), user: asUser(alice, "Alice") });
    expect(await runReview({ entry: await entryFor(bob), user: asUser(bob, "Bob") })).toEqual({
      ok: true,
      alreadyComplete: false,
    });
  });
});

describe("the rewrite", () => {
  it("is saved beside the original, which never changes", async () => {
    const entry = await entryFor(alice);
    await runReview({ entry, user: asUser(alice, "Alice") });

    const rewritten = "Yesterday I went to the shop and I bought some bread. It was delicious.";
    const saved = await saveRewrite({ entryId: entry.id, userId: alice.id, revisedText: rewritten });

    expect(saved?.revisedText).toBe(rewritten);
    expect(saved?.originalText).toBe(ORIGINAL);

    const detail = await getWritingEntry(entry.id, alice.id);
    expect(detail?.entry.originalText).toBe(ORIGINAL);
    expect(detail?.entry.revisedText).toBe(rewritten);
    // And the review it was written against is still there.
    expect(detail?.review?.status).toBe("completed");
    expect(detail?.issues).toHaveLength(3);
  });

  it("can be revised again without touching the first draft", async () => {
    const entry = await entryFor(alice);
    await saveRewrite({ entryId: entry.id, userId: alice.id, revisedText: "A first attempt at fixing it." });
    await saveRewrite({ entryId: entry.id, userId: alice.id, revisedText: "A better attempt at fixing it." });

    const detail = await getWritingEntry(entry.id, alice.id);
    expect(detail?.entry.revisedText).toBe("A better attempt at fixing it.");
    expect(detail?.entry.originalText).toBe(ORIGINAL);
  });
});

describe("the production failure of 18 August 2026", () => {
  /**
   * Entry 72bb3fb4, review a8babf63: 72 output tokens, a summary naming a
   * past-tense problem, an improved text one byte long, and no issues. It was
   * stored as `completed` and the screen said "Nothing to fix".
   */
  const DEGENERATE = {
    summary: "Nice simple story! The main thing to work on is past tense consistency throughout.",
    improvedText: ":",
    issues: [],
  };

  it("never becomes a completed review", async () => {
    fetchMock.mockImplementation(async () => providerAnswers(DEGENERATE));
    const entry = await entryFor(alice);

    const outcome = await runReview({ entry, user: asUser(alice, "Alice") });
    expect(outcome).toEqual({ ok: false, reason: "invalid_response" });

    const detail = await getWritingEntry(entry.id, alice.id);
    // What the learner actually cares about: their writing is still here.
    expect(detail?.entry.originalText).toBe(ORIGINAL);
    expect(detail?.review).toMatchObject({ status: "failed", failureReason: "invalid_response" });
    expect(detail?.review?.improvedText).toBeNull();
    expect(detail?.issues).toEqual([]);
  });

  it("leaves the entry retryable, and a good response then replaces it", async () => {
    fetchMock.mockImplementation(async () => providerAnswers(DEGENERATE));
    const entry = await entryFor(alice);
    await runReview({ entry, user: asUser(alice, "Alice") });

    fetchMock.mockImplementation(async () => providerAnswers());
    expect(await runReview({ entry, user: asUser(alice, "Alice") })).toEqual({
      ok: true,
      alreadyComplete: false,
    });

    const detail = await getWritingEntry(entry.id, alice.id);
    expect(detail?.review).toMatchObject({
      status: "completed",
      improvedText: REVIEW_PAYLOAD.improvedText,
      failureReason: null,
    });
    expect(detail?.issues).toHaveLength(3);
  });

  it("rejects a response where one issue is malformed, rather than dropping it", async () => {
    // The old behaviour kept the good issues and presented the result as
    // finished. Two valid findings are not worth a review the learner cannot
    // trust.
    fetchMock.mockImplementation(async () =>
      providerAnswers({
        ...REVIEW_PAYLOAD,
        issues: [
          REVIEW_PAYLOAD.issues[0],
          { ...REVIEW_PAYLOAD.issues[1], category: "articles" },
          REVIEW_PAYLOAD.issues[2],
        ],
      }),
    );

    const entry = await entryFor(alice);
    expect(await runReview({ entry, user: asUser(alice, "Alice") })).toEqual({
      ok: false,
      reason: "invalid_response",
    });

    const detail = await getWritingEntry(entry.id, alice.id);
    expect(detail?.review?.status).toBe("failed");
    // Not one issue was persisted from a response we did not trust.
    expect(detail?.issues).toEqual([]);
  });
});

describe("a bad review already sitting in the database", () => {
  /**
   * The real one in production cannot be reviewed again by the old rules: it
   * is marked `completed`, so every path treats it as finished. Rather than
   * migrating over it, the app now recognises an unusable row and lets its
   * author ask again.
   */
  async function storeUnusableCompletedReview(entryId: string) {
    await db.insert(writingReviews).values({
      entryId,
      model: "anthropic/claude-sonnet-5",
      status: "completed",
      summary: "Nice simple story! The main thing to work on is past tense consistency.",
      improvedText: ":",
      inputTokens: 1499,
      outputTokens: 72,
    });
  }

  it("is offered to the learner as a failure, not as a finished review", async () => {
    const entry = await entryFor(alice);
    await storeUnusableCompletedReview(entry.id);

    const detail = await getWritingEntry(entry.id, alice.id);
    // The row is untouched — nothing rewrote or deleted it.
    expect(detail?.review).toMatchObject({ status: "completed", improvedText: ":" });
    // But it is not usable, and the app knows it.
    expect(isUsableReviewContent(detail!.review!.summary, detail!.review!.improvedText)).toBe(
      false,
    );
  });

  it("can be reviewed again, and a good response takes its place", async () => {
    const entry = await entryFor(alice);
    await storeUnusableCompletedReview(entry.id);

    expect(await runReview({ entry, user: asUser(alice, "Alice") })).toEqual({
      ok: true,
      alreadyComplete: false,
    });

    const detail = await getWritingEntry(entry.id, alice.id);
    expect(detail?.review).toMatchObject({
      status: "completed",
      improvedText: REVIEW_PAYLOAD.improvedText,
    });
    expect(detail?.issues).toHaveLength(3);
    // Still one review row: the bad one was retaken, not duplicated.
    const reviews = await db.select().from(writingReviews).where(eq(writingReviews.entryId, entry.id));
    expect(reviews).toHaveLength(1);
  });

  it("is left alone once it holds a real review again", async () => {
    const entry = await entryFor(alice);
    await runReview({ entry, user: asUser(alice, "Alice") });
    fetchMock.mockClear();

    expect(await runReview({ entry, user: asUser(alice, "Alice") })).toEqual({
      ok: true,
      alreadyComplete: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the recent writing list", () => {
  /** Entries are ordered by createdAt, so the fixtures need distinct instants. */
  async function entryAt(account: TestAccount, when: string, languageId?: string) {
    const [row] = await db
      .insert(writingEntries)
      .values({
        userId: account.id,
        userLanguageId: languageId ?? account.languageId,
        type: "free_writing",
        originalText: `${ORIGINAL} Written at ${when}.`,
        wordCount: 18,
        createdAt: new Date(when),
      })
      .returning();
    return row;
  }

  it("shows the newest first", async () => {
    await entryAt(alice, "2026-08-16T10:00:00Z");
    const newest = await entryAt(alice, "2026-08-18T10:00:00Z");
    const middle = await entryAt(alice, "2026-08-17T10:00:00Z");

    const recent = await getRecentWritingEntries({
      userId: alice.id,
      userLanguageId: alice.languageId,
    });

    expect(recent.map((entry) => entry.id).slice(0, 2)).toEqual([newest.id, middle.id]);
  });

  it("stops at three, however much has been written", async () => {
    for (let day = 10; day < 20; day += 1) {
      await entryAt(alice, `2026-08-${day}T10:00:00Z`);
    }

    const recent = await getRecentWritingEntries({
      userId: alice.id,
      userLanguageId: alice.languageId,
    });
    expect(recent).toHaveLength(3);
    // And they are the three most recent, not the first three written.
    expect(recent[0].createdAt).toEqual(new Date("2026-08-19T10:00:00Z"));
  });

  it("shows nothing before anything has been written", async () => {
    expect(
      await getRecentWritingEntries({ userId: alice.id, userLanguageId: alice.languageId }),
    ).toEqual([]);
  });

  it("never shows one learner another learner's writing", async () => {
    await entryAt(alice, "2026-08-18T10:00:00Z");
    const bobs = await entryAt(bob, "2026-08-18T11:00:00Z");

    const forAlice = await getRecentWritingEntries({
      userId: alice.id,
      userLanguageId: alice.languageId,
    });

    expect(forAlice.map((entry) => entry.id)).not.toContain(bobs.id);
    expect(forAlice).toHaveLength(1);
  });

  it("does not leak across a user's own languages", async () => {
    const [second] = await db
      .insert(userLanguages)
      .values({
        userId: alice.id,
        languageCode: "de",
        languageName: "German",
        isPrimary: false,
      })
      .returning();

    const english = await entryAt(alice, "2026-08-18T10:00:00Z");
    const german = await entryAt(alice, "2026-08-18T11:00:00Z", second.id);

    const forEnglish = await getRecentWritingEntries({
      userId: alice.id,
      userLanguageId: alice.languageId,
    });
    const forGerman = await getRecentWritingEntries({
      userId: alice.id,
      userLanguageId: second.id,
    });

    expect(forEnglish.map((entry) => entry.id)).toEqual([english.id]);
    expect(forGerman.map((entry) => entry.id)).toEqual([german.id]);
  });

  it("says an unreviewed entry needs review", async () => {
    await entryAt(alice, "2026-08-18T10:00:00Z");
    const [recent] = await getRecentWritingEntries({
      userId: alice.id,
      userLanguageId: alice.languageId,
    });
    expect(recent.status).toBe("needs_review");
  });

  it("says a reviewed entry is reviewed", async () => {
    const entry = await entryAt(alice, "2026-08-18T10:00:00Z");
    await runReview({ entry, user: asUser(alice, "Alice") });

    const [recent] = await getRecentWritingEntries({
      userId: alice.id,
      userLanguageId: alice.languageId,
    });
    expect(recent.status).toBe("reviewed");
  });

  it("says the production-shaped bad review still needs review", async () => {
    const entry = await entryAt(alice, "2026-08-18T10:00:00Z");
    await db.insert(writingReviews).values({
      entryId: entry.id,
      model: "anthropic/claude-sonnet-5",
      status: "completed",
      summary: "Nice simple story! The main thing to work on is past tense consistency.",
      improvedText: ":",
    });

    const [recent] = await getRecentWritingEntries({
      userId: alice.id,
      userLanguageId: alice.languageId,
    });
    // Calling it "Reviewed" would send somebody to an empty screen.
    expect(recent.status).toBe("needs_review");
  });

  it("says a rewritten entry is rewritten", async () => {
    const entry = await entryAt(alice, "2026-08-18T10:00:00Z");
    await runReview({ entry, user: asUser(alice, "Alice") });
    await saveRewrite({
      entryId: entry.id,
      userId: alice.id,
      revisedText: "Yesterday I went to the shop and I bought some bread.",
    });

    const [recent] = await getRecentWritingEntries({
      userId: alice.id,
      userLanguageId: alice.languageId,
    });
    expect(recent.status).toBe("rewritten");
  });

  it("reports the word count and the kind of writing", async () => {
    await entryAt(alice, "2026-08-18T10:00:00Z");
    const [recent] = await getRecentWritingEntries({
      userId: alice.id,
      userLanguageId: alice.languageId,
    });

    expect(recent).toMatchObject({ type: "free_writing", wordCount: 18 });
  });
});

describe("what the database refuses outright", () => {
  it("will not store writing longer than the cost boundary allows", async () => {
    await expect(
      createWritingEntry({
        userId: alice.id,
        userLanguageId: alice.languageId,
        type: "free_writing",
        originalText: "a".repeat(6001),
        wordCount: 1,
      }),
    ).rejects.toThrow();
  });

  it("will not store half a highlight", async () => {
    const entry = await entryFor(alice);
    await runReview({ entry, user: asUser(alice, "Alice") });
    const review = await readReview(entry.id);

    await expect(
      db.insert(writingIssues).values({
        reviewId: review!.id,
        position: 9,
        category: "grammar",
        severity: "error",
        originalFragment: "x",
        suggestion: "y",
        explanation: "z",
        startOffset: 3,
        endOffset: null,
      }),
    ).rejects.toThrow();
  });

  it("will not mark a review completed with nothing in it", async () => {
    const entry = await entryFor(alice);
    await expect(
      db.insert(writingReviews).values({
        entryId: entry.id,
        model: "test/model",
        status: "completed",
      }),
    ).rejects.toThrow();
  });
});
