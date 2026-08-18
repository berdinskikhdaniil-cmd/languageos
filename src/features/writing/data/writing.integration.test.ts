import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { writingEntries, writingIssues, writingReviews } from "@/db/schema";
import type { OnboardedUser } from "@/lib/auth/current-user";
import { createTestAccount, deleteTestAccount, type TestAccount } from "@/test/db-fixtures";
import { createWritingEntry, getWritingEntry, saveRewrite } from "./entries";
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
