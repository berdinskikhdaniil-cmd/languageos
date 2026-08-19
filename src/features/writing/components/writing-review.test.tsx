// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

/**
 * The screen talks to the server through two actions and the router. Neither is
 * what this file is about, and importing the real ones would drag a database
 * connection into a suite that must run without one.
 */
vi.mock("../actions", () => ({
  retryReviewAction: vi.fn(async () => ({ ok: true })),
  saveRewriteAction: vi.fn(async () => ({ ok: true })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  // The route this screen actually lives on. The bottom bar is hidden here,
  // which is what decides where the correction panel pins itself.
  usePathname: () => "/practice/writing/entry-1",
}));
import { LocaleProvider } from "@/lib/i18n/locale-context";
import type { WritingEntryView } from "../domain/review-view";
import { WritingEntryView as ReviewScreen } from "./writing-entry-view";

/**
 * The review screen as somebody actually uses it: tap a highlighted phrase and
 * read what is wrong with it.
 *
 * The whole point of this iteration is that the explanation arrives where the
 * mistake is, so the test taps the text rather than inspecting a data
 * structure. Nothing here touches the server — the view is already a plain
 * object by the time a component sees it.
 */

const TEXT = "Yesterday I go to the shop and I buyed some bread for my breakfast today.";

function at(fragment: string) {
  const start = TEXT.indexOf(fragment);
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
    label: "phrasing",
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

function view(overrides: Partial<WritingEntryView> = {}): WritingEntryView {
  return {
    id: "entry-1",
    type: "free_writing",
    originalText: TEXT,
    revisedText: null,
    wordCount: 14,
    unreviewedReason: null,
    review: {
      status: "completed",
      summary: "Clear, but watch your past tenses.",
      improvedText: "Yesterday I went to the shop and I bought some bread for breakfast.",
      issues: ISSUES,
      spans: [
        { span: at("I go"), issueIndex: 0, severity: "error", category: "grammar", label: "past tense" },
        {
          span: at("buyed"),
          issueIndex: 1,
          severity: "awkward",
          category: "naturalness",
          label: "phrasing",
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

function highlight(fragment: string) {
  return screen
    .getAllByRole("button")
    .find((element) => element.textContent === fragment);
}

/**
 * The learner's own paragraph — found through one of its marks, since the
 * improved version on the same page opens with the same word.
 */
function renderedText() {
  const mark = highlight("I go") ?? highlight("buyed");
  return mark?.closest("p")?.textContent;
}

function panel() {
  return screen.queryByRole("region", { name: "Correction" });
}

afterEach(cleanup);

describe("the learner's text", () => {
  it("is reproduced character for character", () => {
    render(<ReviewScreen entry={view()} />);
    expect(renderedText()).toBe(TEXT);
  });

  it("marks every placed issue, and nothing else", () => {
    render(<ReviewScreen entry={view()} />);

    for (const fragment of ["I go", "buyed", "for my breakfast"]) {
      expect(highlight(fragment)).toBeDefined();
    }
    expect(highlight("the shop")).toBeUndefined();
  });

  it("invites the reader to use it", () => {
    render(<ReviewScreen entry={view()} />);
    expect(screen.getByText("Tap a highlighted phrase to see the correction.")).toBeDefined();
  });
});

describe("severity", () => {
  it("colours each mark by how serious it is, from tokens", () => {
    render(<ReviewScreen entry={view()} />);

    expect(highlight("I go")?.className).toContain("severity-error");
    expect(highlight("buyed")?.className).toContain("severity-awkward");
    expect(highlight("for my breakfast")?.className).toContain("severity-style");
  });

  it("never leaves colour as the only signal", () => {
    render(<ReviewScreen entry={view()} />);
    // An underline carries it for anyone who cannot see the tint.
    expect(highlight("I go")?.className).toContain("underline");
  });

  it("uses no hard-coded colour of its own", () => {
    render(<ReviewScreen entry={view()} />);
    expect(highlight("I go")?.className).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});

describe("tapping a phrase", () => {
  it("shows that phrase's correction straight away", () => {
    render(<ReviewScreen entry={view()} />);
    expect(panel()).toBeNull();

    fireEvent.click(highlight("buyed")!);

    const open = panel()!;
    expect(within(open).getByText("buyed")).toBeDefined();
    expect(within(open).getByText("bought")).toBeDefined();
    expect(within(open).getByText("Buy is irregular; its past form is bought.")).toBeDefined();
    expect(within(open).getByText("Naturalness · phrasing · Awkward")).toBeDefined();
  });

  it("marks that phrase as the selected one", () => {
    render(<ReviewScreen entry={view()} />);
    fireEvent.click(highlight("buyed")!);

    expect(highlight("buyed")?.getAttribute("aria-pressed")).toBe("true");
    // The others stay visible, and stay unselected.
    expect(highlight("I go")?.getAttribute("aria-pressed")).toBe("false");
    expect(highlight("I go")).toBeDefined();
  });

  it("swaps to another phrase without closing anything first", () => {
    render(<ReviewScreen entry={view()} />);

    fireEvent.click(highlight("buyed")!);
    fireEvent.click(highlight("I go")!);

    const open = panel()!;
    expect(within(open).getByText("I went")).toBeDefined();
    expect(within(open).queryByText("bought")).toBeNull();
    expect(highlight("I go")?.getAttribute("aria-pressed")).toBe("true");
    expect(highlight("buyed")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("works from the keyboard", () => {
    render(<ReviewScreen entry={view()} />);

    fireEvent.keyDown(highlight("I go")!, { key: "Enter" });
    expect(within(panel()!).getByText("I went")).toBeDefined();
  });

  it("closes on Escape, leaving every mark in place", () => {
    render(<ReviewScreen entry={view()} />);
    fireEvent.click(highlight("I go")!);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(panel()).toBeNull();
    expect(highlight("I go")?.getAttribute("aria-pressed")).toBe("false");
    expect(renderedText()).toBe(TEXT);
  });

  it("closes from its own button", () => {
    render(<ReviewScreen entry={view()} />);
    fireEvent.click(highlight("I go")!);
    fireEvent.click(screen.getByRole("button", { name: "Close correction" }));

    expect(panel()).toBeNull();
  });
});

describe("issues that could not be placed in the text", () => {
  it("are shown once, below, and never inline", () => {
    const model = view();
    if (model.review?.status !== "completed") throw new Error("bad fixture");
    // Only the first two were resolvable.
    model.review.spans = model.review.spans.slice(0, 2);

    render(<ReviewScreen entry={model} />);

    expect(screen.getByText("Other feedback")).toBeDefined();
    expect(screen.getByText("The possessive is not needed here.")).toBeDefined();
    expect(highlight("for my breakfast")).toBeUndefined();
  });

  it("do not repeat an issue that is already in the text", () => {
    render(<ReviewScreen entry={view()} />);

    expect(screen.queryByText("Other feedback")).toBeNull();
    // Its explanation appears only once the phrase is tapped.
    expect(screen.queryByText("Yesterday needs the past tense.")).toBeNull();
  });

  it("leave the section out entirely when everything was placed", () => {
    render(<ReviewScreen entry={view()} />);
    expect(screen.queryByText("Other feedback")).toBeNull();
  });
});

describe("the rest of the review", () => {
  it("still offers the better version and the rewrite", () => {
    render(<ReviewScreen entry={view()} />);

    expect(screen.getByText("Better version")).toBeDefined();
    expect(
      screen.getByText("Yesterday I went to the shop and I bought some bread for breakfast."),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Rewrite it" })).toBeDefined();
  });

  it("hands the learner their own text back to rewrite, not the corrected one", () => {
    render(<ReviewScreen entry={view()} />);
    fireEvent.click(screen.getByRole("button", { name: "Rewrite it" }));

    const editor = screen.getByRole("textbox", { name: "Your rewrite" }) as HTMLTextAreaElement;
    expect(editor.value).toBe(TEXT);
  });

  it("says so plainly when there was nothing to fix", () => {
    const model = view();
    if (model.review?.status !== "completed") throw new Error("bad fixture");
    model.review.issues = [];
    model.review.spans = [];

    render(<ReviewScreen entry={model} />);
    expect(screen.getByText("Nothing to fix")).toBeDefined();
  });

  it("no longer lists every issue under a heading of its own", () => {
    // The long duplicate list this iteration removed.
    render(<ReviewScreen entry={view()} />);
    expect(screen.queryByText(/things to fix/)).toBeNull();
  });
});

describe("the same review, read in Russian", () => {
  function renderRussian(model = view()) {
    return render(
      <LocaleProvider language="ru">
        <ReviewScreen entry={model} />
      </LocaleProvider>,
    );
  }

  /** The panel names itself in the interface language, so it is found by that. */
  const russianPanel = () => screen.getByRole("region", { name: "Исправление" });

  it("translates every heading and control the product owns", () => {
    renderRussian();

    expect(screen.getByText("Разбор")).toBeDefined();
    expect(screen.getByText("Ваш текст")).toBeDefined();
    expect(screen.getByText("Как было бы лучше")).toBeDefined();
    expect(screen.getByRole("button", { name: "Переписать" })).toBeDefined();
    expect(screen.getByText("Нажмите на подчёркнутую фразу, чтобы увидеть исправление.")).toBeDefined();
  });

  it("counts the words the way Russian counts them", () => {
    renderRussian(view({ wordCount: 21 }));
    expect(screen.getByText("21 слово")).toBeDefined();

    cleanup();
    renderRussian(view({ wordCount: 14 }));
    expect(screen.getByText("14 слов")).toBeDefined();
  });

  it("translates the category and the severity, and leaves the skill label alone", () => {
    renderRussian();
    fireEvent.click(highlight("buyed")!);

    // "naturalness" and "awkward" are stored identifiers and unchanged; only
    // their display text follows the interface. The label is the model's own
    // canonical English, kept so the future mistake engine sees one skill.
    expect(within(russianPanel()).getByText("Естественность · phrasing · Неестественно")).toBeDefined();
  });

  it("leaves the review's own words exactly as they were written", () => {
    // This entry was reviewed while the learner was reading English. Switching
    // the interface does not retranslate work already done.
    renderRussian();

    expect(screen.getByText("Clear, but watch your past tenses.")).toBeDefined();
    expect(
      screen.getByText("Yesterday I went to the shop and I bought some bread for breakfast."),
    ).toBeDefined();
    expect(renderedText()).toBe(TEXT);
  });

  it("does not touch the learner's own text either", () => {
    renderRussian();
    fireEvent.click(highlight("buyed")!);

    const open = russianPanel();
    expect(within(open).getByText("buyed")).toBeDefined();
    expect(within(open).getByText("bought")).toBeDefined();
  });
});
