import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { sessions, speakingAttempts, speakingIssues, speakingReviews } from "@/db/schema";
import type { OnboardedUser } from "@/lib/auth/current-user";
import { createTestAccount, deleteTestAccount, type TestAccount } from "@/test/db-fixtures";
import {
  claimSpeakingAttempt,
  getRecentSpeakingAttempts,
  getSpeakingAttempt,
  linkTrackerSession,
  saveTranscript,
  failTranscription,
} from "./attempts";
import { runSpeakingReview } from "./review-runner";
import { ageSpeakingReviewForTesting, readSpeakingReview } from "./reviews";

/**
 * Speaking against the real database.
 *
 * The provider is stubbed at `fetch` — these tests are about ownership,
 * idempotency and the tracker link, and none of them should cost money or
 * depend on a model being up.
 */

const TRANSCRIPT =
  "Yesterday I go to the shop and I buyed some bread for my breakfast today, it was nice.";

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
    primaryLanguage: { id: account.languageId, code: "en", name: "English", dailyGoalMinutes: 30 },
    onboardingCompletedAt: new Date("2026-08-01T00:00:00Z"),
  };
}

const REVIEW_PAYLOAD = {
  summary: "Easy to follow. Watch your past tenses.",
  improvedAnswer: "Yesterday I went to the shop and bought some bread for breakfast. It was nice.",
  content: { verdict: "yes", comment: "You answered the topic directly." },
  issues: [
    {
      category: "grammar",
      label: "past tense",
      severity: "error",
      originalFragment: "I go",
      suggestion: "I went",
      explanation: "Yesterday needs the past tense.",
    },
  ],
};

function completionResponse(payload: unknown = REVIEW_PAYLOAD) {
  return new Response(
    JSON.stringify({
      model: "test/model-v1",
      choices: [{ message: { content: JSON.stringify(payload) } }],
      usage: { prompt_tokens: 100, completion_tokens: 200 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/** A transcribed attempt, ready to be reviewed. */
async function transcribedAttempt(
  account: TestAccount,
  { requestId = crypto.randomUUID(), seconds = 42 } = {},
) {
  const claim = await claimSpeakingAttempt({
    userId: account.id,
    userLanguageId: account.languageId,
    clientRequestId: requestId,
    topicKey: "yesterday",
    topicPrompt: "Describe what you did yesterday.",
    durationSeconds: seconds,
    audioFormat: "webm",
    audioBytes: 120_000,
  });
  if (!claim) throw new Error("could not claim an attempt");

  const saved = await saveTranscript({
    attemptId: claim.attempt.id,
    transcript: TRANSCRIPT,
    model: "openai/whisper-large-v3",
    seconds,
    costUsd: 0.0003,
  });
  if (!saved) throw new Error("could not save a transcript");
  return saved;
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
  vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-key");
  vi.stubEnv("OPENROUTER_MODEL", "test/model");
  vi.stubEnv("OPENROUTER_STT_MODEL", "openai/whisper-large-v3");
  // A fresh Response each call: a body can only be read once, so a shared one
  // would make the second review of a run fail for the wrong reason.
  fetchMock = vi.fn(() => Promise.resolve(completionResponse()));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});

  for (const account of [alice, bob]) {
    await db.delete(speakingAttempts).where(eq(speakingAttempts.userId, account.id));
    await db.delete(sessions).where(eq(sessions.userId, account.id));
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("who an attempt belongs to", () => {
  it("is filed against the account's own language", async () => {
    const attempt = await transcribedAttempt(alice);
    expect(attempt.userId).toBe(alice.id);
    expect(attempt.userLanguageId).toBe(alice.languageId);
  });

  it("cannot be filed against somebody else's language", async () => {
    // The composite foreign key makes it structurally impossible, whatever a
    // future code path might try to insert.
    await expect(
      claimSpeakingAttempt({
        userId: alice.id,
        userLanguageId: bob.languageId,
        clientRequestId: crypto.randomUUID(),
        topicKey: "yesterday",
        topicPrompt: "Describe what you did yesterday.",
        durationSeconds: 30,
        audioFormat: "webm",
        audioBytes: 1000,
      }),
    ).rejects.toThrow();
  });

  it("is not readable by another account", async () => {
    const attempt = await transcribedAttempt(alice);

    expect(await getSpeakingAttempt(attempt.id, bob.id)).toBeNull();
    expect(await getSpeakingAttempt(attempt.id, alice.id)).not.toBeNull();
  });

  it("does not appear in another account's recent list", async () => {
    await transcribedAttempt(alice);

    const hers = await getRecentSpeakingAttempts({
      userId: alice.id,
      userLanguageId: alice.languageId,
    });
    const his = await getRecentSpeakingAttempts({
      userId: bob.id,
      userLanguageId: bob.languageId,
    });

    expect(hers).toHaveLength(1);
    expect(his).toHaveLength(0);
  });
});

describe("sending the same recording twice", () => {
  it("creates one attempt, and the second send finds the first", async () => {
    const requestId = crypto.randomUUID();
    const first = await claimSpeakingAttempt({
      userId: alice.id,
      userLanguageId: alice.languageId,
      clientRequestId: requestId,
      topicKey: "yesterday",
      topicPrompt: "Describe what you did yesterday.",
      durationSeconds: 30,
      audioFormat: "webm",
      audioBytes: 1000,
    });
    const second = await claimSpeakingAttempt({
      userId: alice.id,
      userLanguageId: alice.languageId,
      clientRequestId: requestId,
      topicKey: "yesterday",
      topicPrompt: "Describe what you did yesterday.",
      durationSeconds: 30,
      audioFormat: "webm",
      audioBytes: 1000,
    });

    expect(first?.created).toBe(true);
    expect(second?.created).toBe(false);
    expect(second?.attempt.id).toBe(first?.attempt.id);

    const rows = await db
      .select()
      .from(speakingAttempts)
      .where(eq(speakingAttempts.userId, alice.id));
    expect(rows).toHaveLength(1);
  });

  it("keeps one account's request id from reaching another's attempt", async () => {
    const requestId = crypto.randomUUID();
    await claimSpeakingAttempt({
      userId: alice.id,
      userLanguageId: alice.languageId,
      clientRequestId: requestId,
      topicKey: "yesterday",
      topicPrompt: "Describe what you did yesterday.",
      durationSeconds: 30,
      audioFormat: "webm",
      audioBytes: 1000,
    });

    // Bob sends the same id. He gets his own new attempt, never hers.
    const his = await claimSpeakingAttempt({
      userId: bob.id,
      userLanguageId: bob.languageId,
      clientRequestId: requestId,
      topicKey: "yesterday",
      topicPrompt: "Describe what you did yesterday.",
      durationSeconds: 30,
      audioFormat: "webm",
      audioBytes: 1000,
    });

    expect(his?.created).toBe(true);
    expect(his?.attempt.userId).toBe(bob.id);
  });
});

describe("what the transcriber measured", () => {
  it("replaces the duration the browser reported", async () => {
    const claim = await claimSpeakingAttempt({
      userId: alice.id,
      userLanguageId: alice.languageId,
      clientRequestId: crypto.randomUUID(),
      topicKey: "yesterday",
      topicPrompt: "Describe what you did yesterday.",
      durationSeconds: 30,
      audioFormat: "webm",
      audioBytes: 1000,
    });

    const saved = await saveTranscript({
      attemptId: claim!.attempt.id,
      transcript: TRANSCRIPT,
      model: "openai/whisper-large-v3",
      seconds: 47.4,
      costUsd: 0.0004,
    });

    expect(saved?.durationSeconds).toBe(47);
    expect(saved?.sttSeconds).toBeCloseTo(47.4, 1);
    expect(saved?.status).toBe("transcribed");
  });

  it("leaves the reported duration alone when the provider measured nothing", async () => {
    const claim = await claimSpeakingAttempt({
      userId: alice.id,
      userLanguageId: alice.languageId,
      clientRequestId: crypto.randomUUID(),
      topicKey: "yesterday",
      topicPrompt: "Describe what you did yesterday.",
      durationSeconds: 30,
      audioFormat: "webm",
      audioBytes: 1000,
    });

    const saved = await saveTranscript({
      attemptId: claim!.attempt.id,
      transcript: TRANSCRIPT,
      model: "openai/whisper-large-v3",
      seconds: null,
      costUsd: null,
    });

    expect(saved?.durationSeconds).toBe(30);
  });
});

describe("reviewing a transcribed answer", () => {
  it("stores the review, its issues and their resolved offsets", async () => {
    const attempt = await transcribedAttempt(alice);
    const outcome = await runSpeakingReview({ attempt, user: asUser(alice, "Alice") });

    expect(outcome).toEqual({ ok: true, alreadyComplete: false });

    const detail = await getSpeakingAttempt(attempt.id, alice.id);
    expect(detail?.attempt.status).toBe("completed");
    expect(detail?.review?.status).toBe("completed");
    expect(detail?.review?.contentVerdict).toBe("yes");
    expect(detail?.issues).toHaveLength(1);

    // Offsets are resolved from the stored transcript, never taken from the model.
    const issue = detail!.issues[0];
    expect(TRANSCRIPT.slice(issue.startOffset!, issue.endOffset!)).toBe("I go");
  });

  it("keeps the transcript when the review fails", async () => {
    const attempt = await transcribedAttempt(alice);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { message: "busy", code: 429 } }), { status: 429 }),
      ),
    );

    const outcome = await runSpeakingReview({ attempt, user: asUser(alice, "Alice") });
    expect(outcome).toEqual({ ok: false, reason: "rate_limited" });

    const detail = await getSpeakingAttempt(attempt.id, alice.id);
    // Their words survived. Only the review is missing.
    expect(detail?.attempt.transcript).toBe(TRANSCRIPT);
    expect(detail?.attempt.status).toBe("transcribed");
    expect(detail?.review?.status).toBe("failed");
    expect(detail?.review?.failureReason).toBe("rate_limited");
  });

  it("refuses a degenerate response rather than storing an empty review", async () => {
    const attempt = await transcribedAttempt(alice);
    fetchMock.mockImplementation(() =>
      Promise.resolve(completionResponse({ ...REVIEW_PAYLOAD, improvedAnswer: ":" })),
    );

    const outcome = await runSpeakingReview({ attempt, user: asUser(alice, "Alice") });
    expect(outcome).toEqual({ ok: false, reason: "invalid_response" });

    const detail = await getSpeakingAttempt(attempt.id, alice.id);
    expect(detail?.review?.status).toBe("failed");
    expect(detail?.issues).toHaveLength(0);
  });

  it("refuses to review an attempt with no transcript", async () => {
    const claim = await claimSpeakingAttempt({
      userId: alice.id,
      userLanguageId: alice.languageId,
      clientRequestId: crypto.randomUUID(),
      topicKey: "yesterday",
      topicPrompt: "Describe what you did yesterday.",
      durationSeconds: 30,
      audioFormat: "webm",
      audioBytes: 1000,
    });
    await failTranscription({ attemptId: claim!.attempt.id, reason: "empty_transcript" });

    const detail = await getSpeakingAttempt(claim!.attempt.id, alice.id);
    const outcome = await runSpeakingReview({
      attempt: detail!.attempt,
      user: asUser(alice, "Alice"),
    });

    expect(outcome).toEqual({ ok: false, reason: "no_transcript" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("retrying", () => {
  it("does not call the provider again once a review is complete", async () => {
    const attempt = await transcribedAttempt(alice);
    await runSpeakingReview({ attempt, user: asUser(alice, "Alice") });
    const callsAfterFirst = fetchMock.mock.calls.length;

    const again = await runSpeakingReview({ attempt, user: asUser(alice, "Alice") });

    expect(again).toEqual({ ok: true, alreadyComplete: true });
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it("reviews again after a failure, and replaces the issues rather than stacking them", async () => {
    const attempt = await transcribedAttempt(alice);

    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { message: "busy", code: 429 } }), { status: 429 }),
      ),
    );
    await runSpeakingReview({ attempt, user: asUser(alice, "Alice") });

    fetchMock.mockImplementation(() => Promise.resolve(completionResponse()));
    const retried = await runSpeakingReview({ attempt, user: asUser(alice, "Alice") });

    expect(retried).toEqual({ ok: true, alreadyComplete: false });
    const detail = await getSpeakingAttempt(attempt.id, alice.id);
    expect(detail?.issues).toHaveLength(1);
  });

  it("refuses to start a second review while one is in flight", async () => {
    const attempt = await transcribedAttempt(alice);
    // A claim exists and is fresh: somebody else is mid-call.
    await runSpeakingReview({ attempt, user: asUser(alice, "Alice") });
    await db
      .update(speakingReviews)
      .set({ status: "pending", summary: null, improvedAnswer: null, updatedAt: new Date() })
      .where(eq(speakingReviews.attemptId, attempt.id));

    const outcome = await runSpeakingReview({ attempt, user: asUser(alice, "Alice") });
    expect(outcome).toEqual({ ok: false, reason: "processing" });
  });

  it("lets an abandoned claim be retaken once it is stale", async () => {
    const attempt = await transcribedAttempt(alice);
    await runSpeakingReview({ attempt, user: asUser(alice, "Alice") });

    const review = await readSpeakingReview(attempt.id);
    await db
      .update(speakingReviews)
      .set({ status: "pending", summary: null, improvedAnswer: null })
      .where(eq(speakingReviews.id, review!.id));
    await ageSpeakingReviewForTesting(review!.id, new Date(Date.now() - 10 * 60 * 1000));

    const outcome = await runSpeakingReview({ attempt, user: asUser(alice, "Alice") });
    expect(outcome).toEqual({ ok: true, alreadyComplete: false });
  });
});

describe("the time a spoken answer counts for", () => {
  it("files exactly one tracker session, for the length of the recording", async () => {
    const attempt = await transcribedAttempt(alice, { seconds: 42 });
    await runSpeakingReview({ attempt, user: asUser(alice, "Alice") });

    const filed = await db.select().from(sessions).where(eq(sessions.userId, alice.id));

    expect(filed).toHaveLength(1);
    expect(filed[0].activityType).toBe("speaking");
    expect(filed[0].durationSeconds).toBe(42);
    expect(filed[0].userLanguageId).toBe(alice.languageId);
    // Dated from the recording, not from now-plus-processing.
    expect(filed[0].endedAt!.getTime() - filed[0].startedAt.getTime()).toBe(42_000);
  });

  it("does not file a second one when the review is run again", async () => {
    const attempt = await transcribedAttempt(alice);
    await runSpeakingReview({ attempt, user: asUser(alice, "Alice") });
    await runSpeakingReview({ attempt, user: asUser(alice, "Alice") });
    await runSpeakingReview({ attempt, user: asUser(alice, "Alice") });

    const filed = await db.select().from(sessions).where(eq(sessions.userId, alice.id));
    expect(filed).toHaveLength(1);
  });

  it("does not file one for an answer whose review failed", async () => {
    const attempt = await transcribedAttempt(alice);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { message: "busy", code: 429 } }), { status: 429 }),
      ),
    );
    await runSpeakingReview({ attempt, user: asUser(alice, "Alice") });

    const filed = await db.select().from(sessions).where(eq(sessions.userId, alice.id));
    expect(filed).toHaveLength(0);
  });

  it("links the session to the attempt, and only ever one", async () => {
    const attempt = await transcribedAttempt(alice);
    await runSpeakingReview({ attempt, user: asUser(alice, "Alice") });

    const [row] = await db
      .select()
      .from(speakingAttempts)
      .where(eq(speakingAttempts.id, attempt.id));

    expect(row.trackerSessionId).not.toBeNull();

    // Calling the linker again is a no-op that returns the existing session.
    const again = await linkTrackerSession({
      attemptId: attempt.id,
      userId: alice.id,
      userLanguageId: alice.languageId,
    });
    expect(again).toBe(row.trackerSessionId);

    const filed = await db.select().from(sessions).where(eq(sessions.userId, alice.id));
    expect(filed).toHaveLength(1);
  });

  it("counts an attempt whose review was already stored but never filed", async () => {
    // A crash between writing the review and filing the session must not lose
    // the time; the next run picks it up.
    const attempt = await transcribedAttempt(alice);
    await runSpeakingReview({ attempt, user: asUser(alice, "Alice") });

    await db.delete(sessions).where(eq(sessions.userId, alice.id));
    await db
      .update(speakingAttempts)
      .set({ trackerSessionId: null })
      .where(eq(speakingAttempts.id, attempt.id));

    await runSpeakingReview({ attempt, user: asUser(alice, "Alice") });
    const filed = await db.select().from(sessions).where(eq(sessions.userId, alice.id));
    expect(filed).toHaveLength(1);
  });
});

describe("deleting an account", () => {
  it("takes its attempts, reviews and issues with it", async () => {
    const temporary = await createTestAccount("Temporary");
    const attempt = await transcribedAttempt(temporary);
    await runSpeakingReview({ attempt, user: asUser(temporary, "Temporary") });

    const review = await readSpeakingReview(attempt.id);
    await deleteTestAccount(temporary);

    expect(
      await db.select().from(speakingAttempts).where(eq(speakingAttempts.id, attempt.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(speakingReviews).where(eq(speakingReviews.attemptId, attempt.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(speakingIssues).where(eq(speakingIssues.reviewId, review!.id)),
    ).toHaveLength(0);
  });
});

describe("what is never stored", () => {
  it("keeps no audio anywhere on the attempt", async () => {
    const attempt = await transcribedAttempt(alice);
    const [row] = await db
      .select()
      .from(speakingAttempts)
      .where(and(eq(speakingAttempts.id, attempt.id), eq(speakingAttempts.userId, alice.id)));

    // Only the shape of the recording survives, never the recording.
    expect(row.audioFormat).toBe("webm");
    expect(row.audioBytes).toBe(120_000);
    expect(Object.keys(row)).not.toContain("audio");
    expect(Object.keys(row)).not.toContain("audioData");
  });
});
