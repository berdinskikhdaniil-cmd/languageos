// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import type { UiLanguage } from "@/lib/i18n/locale";
import { GoalStep } from "./goal-step";
import { LanguageStep } from "./language-step";

/**
 * First-run setup, read by somebody who has not chosen anything yet.
 *
 * This is the case localisation has to get right before any other: the account
 * exists, `users.ui_language` was seeded from Telegram's tag at sign-in, and
 * nothing else about the learner is known. A Russian client must therefore see
 * the very first question in Russian — waiting until onboarding finishes would
 * mean asking somebody to configure an app in a language they came here not to
 * read.
 */

vi.mock("../actions", () => ({
  completeOnboardingAction: vi.fn(async () => ({ ok: false, code: "ONBOARDING_SAVE_FAILED" })),
}));

afterEach(cleanup);

function renderIn(language: UiLanguage, node: React.ReactNode) {
  return render(<LocaleProvider language={language}>{node}</LocaleProvider>);
}

const languageStep = (
  <LanguageStep
    step={1}
    totalSteps={3}
    selected={null}
    onSelect={() => {}}
    onContinue={() => {}}
  />
);

describe("the first question a new account is asked", () => {
  it("is in Russian for an account seeded from a Russian Telegram client", () => {
    renderIn("ru", languageStep);

    expect(screen.getByText("Какой язык вы учите?")).toBeDefined();
    expect(screen.getByRole("button", { name: "Продолжить" })).toBeDefined();
    expect(screen.getByText("1 из 3")).toBeDefined();
  });

  it("is in English for every other account", () => {
    renderIn("en", languageStep);

    expect(screen.getByText("What language are you learning?")).toBeDefined();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDefined();
    expect(screen.getByText("1 of 3")).toBeDefined();
  });

  it("names the languages on offer in the reader's own language", () => {
    renderIn("ru", languageStep);

    expect(screen.getByRole("button", { name: "Английский" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Немецкий" })).toBeDefined();
    // The code behind the row is untouched by any of that.
    expect(screen.queryByRole("button", { name: "German" })).toBeNull();
  });
});

describe("the last step", () => {
  const goalStep = (failure: null) => (
    <GoalStep
      step={3}
      totalSteps={3}
      value={30}
      onChange={() => {}}
      onSubmit={() => {}}
      onBack={() => {}}
      pending={false}
      failure={failure}
    />
  );

  it("closes the flow in the same language it opened in", () => {
    renderIn("ru", goalStep(null));

    expect(screen.getByText("Сколько времени в день вы хотите уделять языку?")).toBeDefined();
    expect(screen.getByRole("button", { name: "Начать учиться" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Назад" })).toBeDefined();
  });

  it("offers the same four goals whichever language is reading", () => {
    const { unmount } = renderIn("en", goalStep(null));
    const english = screen.getAllByRole("button").filter((node) => /\d/.test(node.textContent ?? ""));
    expect(english).toHaveLength(4);
    unmount();

    renderIn("ru", goalStep(null));
    const russian = screen.getAllByRole("button").filter((node) => /\d/.test(node.textContent ?? ""));
    expect(russian).toHaveLength(4);
    expect(russian[0].textContent).toContain("мин");
  });
});
