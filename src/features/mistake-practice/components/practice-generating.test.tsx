// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

/**
 * The waiting screen talks to the server through two actions and the router.
 * Neither is what this file is about, and importing the real ones would drag a
 * database connection into a suite that must run without one.
 */
const generate = vi.fn(async () => ({ ok: true }) as PracticeResult);
const readStatus = vi.fn(async () => ({ status: "generating" }) as StatusResult);
const refresh = vi.fn();

type PracticeResult = { ok: true } | { ok: false; failure: string } | { ok: false; code: string };
type StatusResult = { status: string } | null;

vi.mock("../actions", () => ({
  generatePracticeExercisesAction: (...args: unknown[]) => generate(...(args as [])),
  practiceSessionStatusAction: (...args: unknown[]) => readStatus(...(args as [])),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));

import { LocaleProvider } from "@/lib/i18n/locale-context";
import { PracticeGenerating } from "./practice-generating";

/**
 * What the learner sees while a set is being built, and what makes it stop.
 *
 * The bug this screen exists for was not a slow provider — it was fifteen
 * seconds in which nothing on screen changed, long enough that the first person
 * to try it concluded the app had frozen. So the two things worth holding here
 * are that the screen says what is happening from its first frame, and that it
 * gets out of the way by itself the moment the exercises exist.
 */
function renderScreen(language: "en" | "ru" = "ru") {
  return render(
    <LocaleProvider language={language}>
      <PracticeGenerating sessionId="session-1" />
    </LocaleProvider>,
  );
}

/** Lets the effect's awaited actions settle inside act(). */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  generate.mockReset().mockResolvedValue({ ok: true });
  readStatus.mockReset().mockResolvedValue({ status: "generating" });
  refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the generating screen", () => {
  it("says what is happening before anything has come back", async () => {
    renderScreen();

    // Rendered synchronously, on the very first frame — this is the whole fix.
    expect(screen.getByText("Готовим тренировку")).toBeTruthy();
    expect(screen.getByText(/Создаём 5 новых заданий/)).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();

    await settle();
  });

  it("asks for the exercises itself, once", async () => {
    renderScreen();
    await settle();

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith("session-1");
  });

  it("moves on the moment the set exists", async () => {
    renderScreen();
    await settle();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("stops polling once it has moved on", async () => {
    renderScreen();
    await settle();

    readStatus.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    // Settled means settled: no further reads, and no second refresh.
    expect(readStatus).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps waiting when another request owns the call", async () => {
    generate.mockResolvedValue({ ok: false, failure: "generating" });
    renderScreen();
    await settle();

    expect(refresh).not.toHaveBeenCalled();

    // ...and picks the finish up from the poll instead.
    readStatus.mockResolvedValue({ status: "ready" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("asks again if the wait drags on, so a dead claim is picked back up", async () => {
    generate.mockResolvedValue({ ok: false, failure: "generating" });
    renderScreen();
    await settle();

    expect(generate).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_100);
    });

    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("moves on to the failure screen when the build failed", async () => {
    generate.mockResolvedValue({ ok: false, failure: "generationFailed" });
    renderScreen();
    await settle();

    // The page re-reads the row and renders the retry; this component does not
    // try to draw the failure itself.
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ignores a status read that did not answer", async () => {
    generate.mockResolvedValue({ ok: false, failure: "generating" });
    readStatus.mockResolvedValue(null);
    renderScreen();
    await settle();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(refresh).not.toHaveBeenCalled();
  });

  it("stops everything when it goes away", async () => {
    generate.mockResolvedValue({ ok: false, failure: "generating" });
    const { unmount } = renderScreen();
    await settle();

    unmount();
    generate.mockClear();
    readStatus.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(generate).not.toHaveBeenCalled();
    expect(readStatus).not.toHaveBeenCalled();
  });

  it("counts the seconds once the wait stops feeling instant", async () => {
    generate.mockResolvedValue({ ok: false, failure: "generating" });
    renderScreen();
    await settle();

    expect(screen.getByText(/Обычно это занимает несколько секунд/)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });

    // Russian counts its seconds properly: 8 секунд, not 8 секунду.
    expect(screen.getByText("Готовим уже 8 секунд…")).toBeTruthy();
  });

  it("speaks English to an English reader", async () => {
    generate.mockResolvedValue({ ok: false, failure: "generating" });
    renderScreen("en");
    await settle();

    expect(screen.getByText("Building your practice")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });

    expect(screen.getByText("Building for 8 seconds…")).toBeTruthy();
  });
});
