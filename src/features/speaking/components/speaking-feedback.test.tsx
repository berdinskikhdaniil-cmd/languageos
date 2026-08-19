// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

/**
 * The feedback screen as somebody actually uses it: tap a marked phrase in your
 * own words and read what was wrong with it.
 *
 * The interaction is Writing's, reused — so what is worth testing here is that
 * the reuse actually works on a transcript, that the transcript is reproduced
 * character for character, and that nothing on the screen claims to have
 * judged how the learner sounded.
 */

vi.mock("../actions", () => ({
  reviewSpeakingAttemptAction: vi.fn(async () => ({ ok: true })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

import { LocaleProvider } from "@/lib/i18n/locale-context";
import type { UiLanguage } from "@/lib/i18n/locale";
import type { SpeakingAttemptView as ViewModel } from "../domain/attempt-view";
import { SpeakingAttemptView } from "./speaking-attempt-view";

const TRANSCRIPT =
  "Yesterday I go to the shop and I buyed some bread for my breakfast today.";

function at(fragment: string) {
  const start = TRANSCRIPT.indexOf(fragment);
  return { start, end: start + fragment.length };
}

const ISSUES = [
  {
    id: "a",
    category: "grammar" as const,
    label: "past tense",
    severity: "error" as const,
    originalFragment: "I go",
    suggestion: "I went",
    explanation: "Yesterday needs the past tense.",
  },
  {
    id: "b",
    category: "naturalness" as const,
    label: "irregular verb",
    severity: "awkward" as const,
    originalFragment: "buyed",
    suggestion: "bought",
    explanation: "Buy is irregular; its past form is bought.",
  },
  {
    id: "c",
    category: "style" as const,
    label: "wordiness",
    severity: "style" as const,
    originalFragment: "for my breakfast",
    suggestion: "for breakfast",
    explanation: "The possessive is not needed here.",
  },
];

function view(overrides: Partial<ViewModel> = {}): ViewModel {
  return {
    id: "attempt-1",
    topicPrompt: "Describe what you did yesterday.",
    transcript: TRANSCRIPT,
    durationSeconds: 42,
    status: "completed",
    transcriptionFailureReason: null,
    review: {
      status: "completed",
      summary: "Easy to follow. Watch your past tenses.",
      improvedAnswer: "Yesterday I went to the shop and bought some bread for breakfast.",
      content: { verdict: "yes", comment: "You answered the topic directly." },
      issues: ISSUES,
      spans: [
        { span: at("I go"), issueIndex: 0, severity: "error", category: "grammar", label: "past tense" },
        {
          span: at("buyed"),
          issueIndex: 1,
          severity: "awkward",
          category: "naturalness",
          label: "irregular verb",
        },
        {
          span: at("for my breakfast"),
          issueIndex: 2,
          severity: "style",
          category: "style",
          label: "wordiness",
        },
      ],
    },
    ...overrides,
  };
}

function show(model = view(), language: UiLanguage = "en") {
  return render(
    <LocaleProvider language={language}>
      <SpeakingAttemptView attempt={model} />
    </LocaleProvider>,
  );
}

function highlight(fragment: string) {
  return screen.getAllByRole("button").find((element) => element.textContent === fragment);
}

function renderedTranscript() {
  const mark = highlight("I go") ?? highlight("buyed");
  return mark?.closest("p")?.textContent;
}

const panel = (name = "Correction") => screen.queryByRole("region", { name });

afterEach(cleanup);

describe("the learner's own words", () => {
  it("are reproduced character for character", () => {
    show();
    expect(renderedTranscript()).toBe(TRANSCRIPT);
  });

  it("are labelled as a transcript, not as something they wrote", () => {
    show();
    expect(screen.getByText("Transcript")).toBeDefined();
  });

  it("carry a mark for every placed issue, and nothing else", () => {
    show();
    for (const fragment of ["I go", "buyed", "for my breakfast"]) {
      expect(highlight(fragment), fragment).toBeDefined();
    }
    expect(highlight("the shop")).toBeUndefined();
  });
});

describe("tapping a marked phrase", () => {
  it("shows that phrase's correction straight away", () => {
    show();
    expect(panel()).toBeNull();

    fireEvent.click(highlight("buyed")!);

    const open = panel()!;
    expect(within(open).getByText("buyed")).toBeDefined();
    expect(within(open).getByText("bought")).toBeDefined();
    expect(within(open).getByText("Buy is irregular; its past form is bought.")).toBeDefined();
    expect(within(open).getByText("Naturalness · irregular verb · Awkward")).toBeDefined();
  });

  it("swaps to another phrase without closing anything first", () => {
    show();
    fireEvent.click(highlight("buyed")!);
    fireEvent.click(highlight("I go")!);

    const open = panel()!;
    expect(within(open).getByText("I went")).toBeDefined();
    expect(within(open).queryByText("bought")).toBeNull();
    expect(highlight("I go")?.getAttribute("aria-pressed")).toBe("true");
    expect(highlight("buyed")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("works from the keyboard", () => {
    show();
    fireEvent.keyDown(highlight("I go")!, { key: "Enter" });
    expect(within(panel()!).getByText("I went")).toBeDefined();
  });

  it("closes on Escape, leaving the transcript intact", () => {
    show();
    fireEvent.click(highlight("I go")!);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(panel()).toBeNull();
    expect(renderedTranscript()).toBe(TRANSCRIPT);
  });

  it("colours each mark by severity, from tokens rather than hex values", () => {
    show();
    expect(highlight("I go")?.className).toContain("severity-error");
    expect(highlight("buyed")?.className).toContain("severity-awkward");
    expect(highlight("for my breakfast")?.className).toContain("severity-style");
    expect(highlight("I go")?.className).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});

describe("issues that could not be placed", () => {
  it("are shown once, below, and never inline", () => {
    const model = view();
    if (model.review?.status !== "completed") throw new Error("bad fixture");
    model.review.spans = model.review.spans.slice(0, 2);

    show(model);

    expect(screen.getByText("Other feedback")).toBeDefined();
    expect(screen.getByText("The possessive is not needed here.")).toBeDefined();
    expect(highlight("for my breakfast")).toBeUndefined();
  });

  it("do not repeat an issue that is already marked in the transcript", () => {
    show();
    expect(screen.queryByText("Other feedback")).toBeNull();
    expect(screen.queryByText("Yesterday needs the past tense.")).toBeNull();
  });
});

describe("the rest of the review", () => {
  it("gives a verdict on the answer in words, never a score", () => {
    show();
    expect(screen.getByText("Answered the topic")).toBeDefined();
    expect(screen.getByText("You answered the topic directly.")).toBeDefined();
    expect(screen.queryByText(/\d+\s*\/\s*(10|100)/)).toBeNull();
    expect(screen.queryByText(/\b[ABC][12]\b/)).toBeNull();
  });

  it("offers a better way to say the same thing", () => {
    show();
    expect(screen.getByText("A better way to say it")).toBeDefined();
    expect(
      screen.getByText("Yesterday I went to the shop and bought some bread for breakfast."),
    ).toBeDefined();
  });

  it("says plainly that it did not judge pronunciation", () => {
    show();
    expect(
      screen.getByText("This looks at your words and grammar. It does not judge your pronunciation."),
    ).toBeDefined();
  });

  it("never claims a pronunciation, accent or fluency score", () => {
    show();
    const page = document.body.textContent ?? "";
    expect(page).not.toMatch(/pronunciation score/i);
    expect(page).not.toMatch(/accent/i);
    expect(page).not.toMatch(/fluency/i);
  });

  it("says so plainly when there was nothing to fix", () => {
    const model = view();
    if (model.review?.status !== "completed") throw new Error("bad fixture");
    model.review.issues = [];
    model.review.spans = [];

    show(model);
    expect(screen.getByText("Nothing to fix")).toBeDefined();
  });
});

describe("when the review has not arrived", () => {
  const unreviewed = () =>
    view({ status: "transcribed", review: { status: "failed", reason: "timeout" } });

  it("keeps the transcript on screen — their words are safe", () => {
    show(unreviewed());
    expect(screen.getByText(TRANSCRIPT)).toBeDefined();
  });

  it("offers to retry the review, not to record again", () => {
    show(unreviewed());
    expect(screen.getByRole("button", { name: "Try the review again" })).toBeDefined();
  });
});

describe("when the recording never became text", () => {
  const untranscribed = () =>
    view({
      status: "failed",
      transcript: null,
      transcriptionFailureReason: "empty_transcript",
      review: null,
    });

  it("explains what happened without mentioning the provider", () => {
    show(untranscribed());
    expect(
      screen.getByText("We could not hear any speech in that recording. Check your microphone and try again."),
    ).toBeDefined();
  });

  it("offers a new recording, because the audio was not kept", () => {
    show(untranscribed());
    // Retrying a review of nothing is a button that could never work.
    expect(screen.queryByRole("button", { name: "Try the review again" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Record another answer" }).length).toBeGreaterThan(0);
  });
});

describe("the same review, read in Russian", () => {
  it("translates the product's own words and leaves the review's alone", () => {
    show(view(), "ru");

    expect(screen.getByText("Расшифровка")).toBeDefined();
    expect(screen.getByText("Разбор")).toBeDefined();
    expect(screen.getByText("Как сказать лучше")).toBeDefined();
    expect(screen.getByText("Содержание")).toBeDefined();
    expect(screen.getByText("Ответ по теме")).toBeDefined();
    // Written when the learner was reading English; not retranslated.
    expect(screen.getByText("Easy to follow. Watch your past tenses.")).toBeDefined();
    expect(renderedTranscript()).toBe(TRANSCRIPT);
  });

  it("translates the category and severity, keeping the canonical skill label", () => {
    show(view(), "ru");
    fireEvent.click(highlight("buyed")!);

    const open = screen.getByRole("region", { name: "Исправление" });
    expect(within(open).getByText("Естественность · irregular verb · Неестественно")).toBeDefined();
  });

  it("still says it did not judge pronunciation", () => {
    show(view(), "ru");
    expect(
      screen.getByText("Мы смотрим на слова и грамматику. Произношение мы не оцениваем."),
    ).toBeDefined();
  });
});
