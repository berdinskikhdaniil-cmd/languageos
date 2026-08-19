import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  mistakePracticeItems,
  mistakePracticeSessions,
  sessions,
  userLanguages,
  writingEntries,
  writingIssues,
  writingReviews,
} from "@/db/schema";
import type { MistakeSelection } from "@/features/mistakes/domain/aggregate";
import { loadMistakeWorkload } from "@/features/mistakes/data/mistakes";
import type { IssueSeverity } from "@/features/writing/domain/review";
import type { OnboardedUser } from "@/lib/auth/current-user";
import { createTestAccount, deleteTestAccount, type TestAccount } from "@/test/db-fixtures";
import type { GeneratedExercise } from "../domain/exercise";
import type { GradedAnswer } from "../domain/grading";
import {
  agePracticeSessionForTesting,
  claimGrading,
  completeGrading,
  failGeneration,
  failGrading,
  getPracticeSession,
  getResumablePractice,
  persistExercises,
  readAnswers,
  reclaimGeneration,
  saveAnswer,
  startGeneration,
} from "./sessions";
import { loadWeakSpots, resolvePracticeTarget } from "./targets";

/**
 * Targeted practice against the real database.
 *
 * Three things are being held here. Ownership, in the sense the rest of the
 * product means it: one account cannot read, answer or check another's set, and
 * a second language on the same account is a separate picture. The claims, which
 * are the only thing standing between a double tap and a double charge — and
 * which are database predicates rather than hopeful code, so they can only
 * honestly be tested here. And the analytics invariant: practising must leave
 * the learner's history of mistakes exactly as it was, and must not file study
 * time.
 */

const ZONE = "Europe/Amsterdam";
const TODAY = new Date("2026-08-19T08:00:00Z");

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

const PAST_TENSE: MistakeSelection = { kind: "skill", key: "past tense" };

async function addWriting({
  account,
  languageId,
  createdAt = TODAY,
  issues = [] as { label: string | null; severity?: IssueSeverity }[],
}: {
  account: TestAccount;
  languageId?: string;
  createdAt?: Date;
  issues?: { label: string | null; severity?: IssueSeverity }[];
}): Promise<void> {
  const [entry] = await db
    .insert(writingEntries)
    .values({
      userId: account.id,
      userLanguageId: languageId ?? account.languageId,
      type: "free_writing",
      originalText: "Yesterday I go to the shop and I buyed some bread.",
      wordCount: 200,
      createdAt,
    })
    .returning();

  const [review] = await db
    .insert(writingReviews)
    .values({
      entryId: entry.id,
      status: "completed",
      model: "test/model",
      summary: "Clear enough. Watch your past tenses.",
      improvedText: "Yesterday I went to the shop and bought some bread.",
    })
    .returning();

  if (issues.length > 0) {
    await db.insert(writingIssues).values(
      issues.map((issue, position) => ({
        reviewId: review.id,
        position,
        category: "grammar" as const,
        label: issue.label,
        severity: issue.severity ?? ("error" as const),
        originalFragment: `I go ${position}`,
        suggestion: "I went",
        explanation: "Yesterday needs the past tense.",
      })),
    );
  }
}

function exercises(): GeneratedExercise[] {
  return [1, 2, 3, 4, 5].map((position) => ({
    type: position % 2 === 0 ? ("rewrite" as const) : ("fill_blank" as const),
    prompt: `Exercise ${position}: yesterday we ___ (go) somewhere new.`,
    canonicalAnswer: `answer ${position}`,
    gradingNotes: `notes ${position}`,
  }));
}

function verdicts(): GradedAnswer[] {
  return [1, 2, 3, 4, 5].map((position) => ({
    position,
    verdict: position === 5 ? ("incorrect" as const) : ("correct" as const),
    correctedAnswer: `answer ${position}`,
    explanation: "Past simple of an irregular verb.",
  }));
}

/** A ready session with five exercises, owned by `account`. */
async function readySession(account: TestAccount, languageId = account.languageId) {
  const claim = await startGeneration({
    userId: account.id,
    userLanguageId: languageId,
    target: PAST_TENSE,
    model: "test/model",
  });
  expect(claim.status).toBe("claimed");

  await persistExercises({
    sessionId: claim.session.id,
    model: "test/model",
    exercises: exercises(),
    usage: { inputTokens: 100, outputTokens: 200 },
  });

  return claim.session.id;
}

beforeAll(async () => {
  alice = await createTestAccount("Practice Alice", { timeZone: ZONE });
  bob = await createTestAccount("Practice Bob", { timeZone: ZONE });

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
    await db.delete(mistakePracticeSessions).where(eq(mistakePracticeSessions.userId, account.id));
    await db.delete(writingEntries).where(eq(writingEntries.userId, account.id));
    await db.delete(sessions).where(eq(sessions.userId, account.id));
  }
});

describe("resolving a target", () => {
  it("accepts a weak point the learner actually has", async () => {
    await addWriting({ account: alice, issues: [{ label: "past tense" }, { label: "past tense" }] });

    const resolved = await resolvePracticeTarget(asUser(alice), PAST_TENSE);

    expect(resolved).not.toBeNull();
    expect(resolved?.occurrences).toHaveLength(2);
    expect(resolved?.name).toBe("past tense");
  });

  it("refuses a weak point that belongs to somebody else", async () => {
    await addWriting({ account: bob, issues: [{ label: "past tense" }] });

    expect(await resolvePracticeTarget(asUser(alice), PAST_TENSE)).toBeNull();
  });

  it("refuses a weak point from the account's other language", async () => {
    await addWriting({
      account: alice,
      languageId: aliceGerman,
      issues: [{ label: "past tense" }],
    });

    // Studying English today; the German weak points are a different picture.
    expect(await resolvePracticeTarget(asUser(alice), PAST_TENSE)).toBeNull();
    expect(await resolvePracticeTarget(asUser(alice, aliceGerman), PAST_TENSE)).not.toBeNull();
  });

  it("refuses a weak point made entirely of improvement suggestions", async () => {
    await addWriting({
      account: alice,
      issues: [
        { label: "past tense", severity: "style" },
        { label: "past tense", severity: "awkward" },
      ],
    });

    expect(await resolvePracticeTarget(asUser(alice), PAST_TENSE)).toBeNull();
  });

  it("refuses a target nobody has any occurrences for", async () => {
    await addWriting({ account: alice, issues: [{ label: "articles" }] });

    expect(await resolvePracticeTarget(asUser(alice), PAST_TENSE)).toBeNull();
  });
});

describe("weak spots on the hub", () => {
  it("offers a repeated skill from the learner's own reviews", async () => {
    await addWriting({ account: alice, issues: [{ label: "past tense" }, { label: "past tense" }] });
    await addWriting({ account: bob, issues: [{ label: "articles" }, { label: "articles" }] });

    const spots = await loadWeakSpots(asUser(alice), new Date("2026-08-19T09:00:00Z"));

    expect(spots[0].target).toEqual(PAST_TENSE);
    expect(spots.map((spot) => spot.target)).not.toContainEqual({ kind: "skill", key: "articles" });
  });

  it("offers nothing to an account with no reviewed work", async () => {
    expect(await loadWeakSpots(asUser(alice), new Date("2026-08-19T09:00:00Z"))).toEqual([]);
  });
});

describe("generation claims", () => {
  it("creates exactly five items and opens the session", async () => {
    const sessionId = await readySession(alice);

    const detail = await getPracticeSession(sessionId, alice.id);
    expect(detail?.session.status).toBe("ready");
    expect(detail?.items).toHaveLength(5);
    expect(detail?.items.map((item) => item.position)).toEqual([1, 2, 3, 4, 5]);
    expect(detail?.session.generationInputTokens).toBe(100);
  });

  it("refuses a second generation for the same target while one is in flight", async () => {
    const first = await startGeneration({
      userId: alice.id,
      userLanguageId: alice.languageId,
      target: PAST_TENSE,
      model: "test/model",
    });
    const second = await startGeneration({
      userId: alice.id,
      userLanguageId: alice.languageId,
      target: PAST_TENSE,
      model: "test/model",
    });

    expect(first.status).toBe("claimed");
    expect(second.status).toBe("processing");
    // And it hands back the very session already being built, so the second tap
    // opens it rather than going nowhere.
    expect(second.session.id).toBe(first.session.id);
  });

  it("lets two accounts practise the same weak point at the same time", async () => {
    const mine = await startGeneration({
      userId: alice.id,
      userLanguageId: alice.languageId,
      target: PAST_TENSE,
      model: "test/model",
    });
    const theirs = await startGeneration({
      userId: bob.id,
      userLanguageId: bob.languageId,
      target: PAST_TENSE,
      model: "test/model",
    });

    expect(mine.status).toBe("claimed");
    expect(theirs.status).toBe("claimed");
  });

  it("takes over a claim whose request died", async () => {
    const first = await startGeneration({
      userId: alice.id,
      userLanguageId: alice.languageId,
      target: PAST_TENSE,
      model: "test/model",
    });
    await agePracticeSessionForTesting(first.session.id, new Date(Date.now() - 10 * 60 * 1000));

    const retaken = await startGeneration({
      userId: alice.id,
      userLanguageId: alice.languageId,
      target: PAST_TENSE,
      model: "test/model",
    });

    expect(retaken.status).toBe("claimed");
    expect(retaken.session.id).toBe(first.session.id);
  });

  it("retries a failed session in place, never as a second one", async () => {
    const claim = await startGeneration({
      userId: alice.id,
      userLanguageId: alice.languageId,
      target: PAST_TENSE,
      model: "test/model",
    });
    await failGeneration({ sessionId: claim.session.id, reason: "timeout" });

    const retried = await reclaimGeneration({
      sessionId: claim.session.id,
      userId: alice.id,
      model: "test/model",
    });

    expect(retried?.status).toBe("claimed");
    expect(retried?.session.id).toBe(claim.session.id);

    const rows = await db
      .select()
      .from(mistakePracticeSessions)
      .where(eq(mistakePracticeSessions.userId, alice.id));
    expect(rows).toHaveLength(1);
  });

  it("refuses to retry somebody else's session", async () => {
    const sessionId = await readySession(alice);

    expect(
      await reclaimGeneration({ sessionId, userId: bob.id, model: "test/model" }),
    ).toBeNull();
  });

  it("does not stack two sets of exercises when a retry reuses a row", async () => {
    const sessionId = await readySession(alice);

    await persistExercises({
      sessionId,
      model: "test/model",
      exercises: exercises(),
      usage: { inputTokens: null, outputTokens: null },
    });

    const detail = await getPracticeSession(sessionId, alice.id);
    expect(detail?.items).toHaveLength(5);
  });
});

describe("ownership of a session", () => {
  it("hides one account's set from another", async () => {
    const sessionId = await readySession(alice);

    expect(await getPracticeSession(sessionId, bob.id)).toBeNull();
    expect(await getPracticeSession(sessionId, alice.id)).not.toBeNull();
  });

  it("refuses an answer from another account", async () => {
    const sessionId = await readySession(alice);

    expect(await saveAnswer({ sessionId, userId: bob.id, position: 1, answer: "went" })).toBe(false);
    expect(await readAnswers(sessionId)).toEqual([null, null, null, null, null]);
  });

  it("refuses a check from another account", async () => {
    const sessionId = await readySession(alice);

    const claim = await claimGrading({ sessionId, userId: bob.id, model: "test/model" });
    expect(claim.status).toBe("unavailable");

    const detail = await getPracticeSession(sessionId, alice.id);
    expect(detail?.session.status).toBe("ready");
  });
});

describe("answers", () => {
  it("persists between reads, so a set can be resumed", async () => {
    const sessionId = await readySession(alice);

    expect(await saveAnswer({ sessionId, userId: alice.id, position: 1, answer: " went " })).toBe(
      true,
    );
    expect(await saveAnswer({ sessionId, userId: alice.id, position: 2, answer: "bought" })).toBe(
      true,
    );

    expect(await readAnswers(sessionId)).toEqual(["went", "bought", null, null, null]);
  });

  it("shows a partly-answered set as resumable", async () => {
    const sessionId = await readySession(alice);
    await saveAnswer({ sessionId, userId: alice.id, position: 1, answer: "went" });
    await saveAnswer({ sessionId, userId: alice.id, position: 2, answer: "bought" });

    const resumable = await getResumablePractice({
      userId: alice.id,
      userLanguageId: alice.languageId,
    });

    expect(resumable).toMatchObject({ sessionId, targetType: "skill", targetKey: "past tense" });
    expect(resumable?.answered).toBe(2);
  });

  it("does not offer a set nobody has touched", async () => {
    await readySession(alice);

    expect(
      await getResumablePractice({ userId: alice.id, userLanguageId: alice.languageId }),
    ).toBeNull();
  });

  it("does not offer one account's set to another, or across languages", async () => {
    const sessionId = await readySession(alice);
    await saveAnswer({ sessionId, userId: alice.id, position: 1, answer: "went" });

    expect(
      await getResumablePractice({ userId: bob.id, userLanguageId: bob.languageId }),
    ).toBeNull();
    expect(
      await getResumablePractice({ userId: alice.id, userLanguageId: aliceGerman }),
    ).toBeNull();
  });
});

describe("grading claims", () => {
  it("checks a set once, however many taps arrive", async () => {
    const sessionId = await readySession(alice);
    for (const position of [1, 2, 3, 4, 5]) {
      await saveAnswer({ sessionId, userId: alice.id, position, answer: `answer ${position}` });
    }

    const first = await claimGrading({ sessionId, userId: alice.id, model: "test/model" });
    const second = await claimGrading({ sessionId, userId: alice.id, model: "test/model" });

    expect(first.status).toBe("claimed");
    expect(second.status).toBe("processing");
  });

  it("writes every verdict and closes the session", async () => {
    const sessionId = await readySession(alice);
    for (const position of [1, 2, 3, 4, 5]) {
      await saveAnswer({ sessionId, userId: alice.id, position, answer: `answer ${position}` });
    }
    await claimGrading({ sessionId, userId: alice.id, model: "test/model" });

    await completeGrading({
      sessionId,
      model: "test/model",
      results: verdicts(),
      usage: { inputTokens: 300, outputTokens: 400 },
    });

    const detail = await getPracticeSession(sessionId, alice.id);
    expect(detail?.session.status).toBe("completed");
    expect(detail?.session.completedAt).not.toBeNull();
    expect(detail?.items.map((item) => item.verdict)).toEqual([
      "correct",
      "correct",
      "correct",
      "correct",
      "incorrect",
    ]);
    expect(detail?.session.gradingOutputTokens).toBe(400);
  });

  it("says a completed set is already done rather than checking it again", async () => {
    const sessionId = await readySession(alice);
    await claimGrading({ sessionId, userId: alice.id, model: "test/model" });
    await completeGrading({
      sessionId,
      model: "test/model",
      results: verdicts(),
      usage: { inputTokens: null, outputTokens: null },
    });

    expect((await claimGrading({ sessionId, userId: alice.id, model: "test/model" })).status).toBe(
      "completed",
    );
  });

  it("keeps every answer when a check fails, and reopens the set", async () => {
    const sessionId = await readySession(alice);
    for (const position of [1, 2, 3, 4, 5]) {
      await saveAnswer({ sessionId, userId: alice.id, position, answer: `answer ${position}` });
    }
    await claimGrading({ sessionId, userId: alice.id, model: "test/model" });

    await failGrading({ sessionId, reason: "timeout" });

    const detail = await getPracticeSession(sessionId, alice.id);
    expect(detail?.session.status).toBe("ready");
    expect(detail?.session.failureReason).toBe("timeout");
    expect(await readAnswers(sessionId)).toEqual([
      "answer 1",
      "answer 2",
      "answer 3",
      "answer 4",
      "answer 5",
    ]);
    // And the exercises are the same five — a failed check never regenerates.
    expect(detail?.items.map((item) => item.prompt)).toEqual(
      exercises().map((exercise) => exercise.prompt),
    );
  });

  it("refuses an answer once the set has been checked", async () => {
    const sessionId = await readySession(alice);
    await claimGrading({ sessionId, userId: alice.id, model: "test/model" });
    await completeGrading({
      sessionId,
      model: "test/model",
      results: verdicts(),
      usage: { inputTokens: null, outputTokens: null },
    });

    expect(
      await saveAnswer({ sessionId, userId: alice.id, position: 1, answer: "changed my mind" }),
    ).toBe(false);
  });
});

describe("what practice does not touch", () => {
  it("leaves the learner's history of mistakes exactly as it was", async () => {
    await addWriting({
      account: alice,
      issues: [{ label: "past tense" }, { label: "past tense" }, { label: "articles" }],
    });

    const before = await loadMistakeWorkload({
      userId: alice.id,
      userLanguageId: alice.languageId,
      languageCode: "en",
    });

    const sessionId = await readySession(alice);
    for (const position of [1, 2, 3, 4, 5]) {
      await saveAnswer({ sessionId, userId: alice.id, position, answer: `answer ${position}` });
    }
    await claimGrading({ sessionId, userId: alice.id, model: "test/model" });
    await completeGrading({
      sessionId,
      model: "test/model",
      results: verdicts(),
      usage: { inputTokens: null, outputTokens: null },
    });

    const after = await loadMistakeWorkload({
      userId: alice.id,
      userLanguageId: alice.languageId,
      languageCode: "en",
    });

    // Practising is not a claim that a mistake stopped having happened.
    expect(after.occurrences).toHaveLength(before.occurrences.length);
    expect(after.occurrences.map((item) => item.issueId).sort()).toEqual(
      before.occurrences.map((item) => item.issueId).sort(),
    );
    expect(
      await db.select().from(writingIssues).where(eq(writingIssues.severity, "error")),
    ).not.toHaveLength(0);
  });

  it("files no study time", async () => {
    const sessionId = await readySession(alice);
    await claimGrading({ sessionId, userId: alice.id, model: "test/model" });
    await completeGrading({
      sessionId,
      model: "test/model",
      results: verdicts(),
      usage: { inputTokens: null, outputTokens: null },
    });

    /**
     * Deliberate, and documented as a limitation: there is no honest activity
     * bucket for targeted practice yet, and putting it in one would distort the
     * practice balance on Progress.
     */
    const tracked = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, alice.id)));

    expect(tracked).toHaveLength(0);
  });

  it("takes its items with it when a session goes", async () => {
    const sessionId = await readySession(alice);
    await db.delete(mistakePracticeSessions).where(eq(mistakePracticeSessions.id, sessionId));

    expect(
      await db
        .select()
        .from(mistakePracticeItems)
        .where(eq(mistakePracticeItems.sessionId, sessionId)),
    ).toHaveLength(0);
  });
});
