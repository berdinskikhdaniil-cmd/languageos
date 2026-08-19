// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import { IssueDetailPanel } from "./issue-detail-panel";
import type { DisplayIssue } from "./issue-detail";

/**
 * Where the correction panel sits, and what happens when it does not fit.
 *
 * This is the bug that reached a real iPhone: the panel pinned itself to the
 * viewport bottom, which is right on the writing screens — where the navigation
 * bar is hidden — and wrong on the speaking ones, where the bar is showing and
 * painted straight over the explanation.
 *
 * jsdom computes no layout, so these are assertions about the contract the
 * panel declares rather than about pixels. The pixels are checked in a real
 * browser at the three widths; what is worth locking down here is that the
 * offset is derived from the shared token instead of a number, and that it
 * changes with the route rather than being fixed once.
 */

const ISSUE: DisplayIssue = {
  id: "a",
  category: "grammar",
  label: "past tense",
  severity: "error",
  originalFragment: "I go",
  suggestion: "I went",
  explanation: "Yesterday needs the past tense.",
};

const LONG_ISSUE: DisplayIssue = {
  ...ISSUE,
  id: "b",
  originalFragment: "мы вчера ходить в магазин за хлебом",
  suggestion: "мы вчера ходили в магазин за хлебом",
  explanation:
    "После слова «вчера» глагол должен стоять в прошедшем времени. " +
    "В русском языке форма прошедшего времени согласуется с родом и числом " +
    "подлежащего, поэтому здесь нужна форма «ходили», а не инфинитив «ходить». " +
    "Инфинитив используется только после модальных глаголов и в некоторых " +
    "других конструкциях, которых здесь нет.",
};

let pathname = "/practice/speaking/attempt-1";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

function show(issue: DisplayIssue | null, onClose = vi.fn(), route = pathname) {
  pathname = route;
  render(
    <LocaleProvider language="en">
      <IssueDetailPanel issue={issue} onClose={onClose} />
    </LocaleProvider>,
  );
  return onClose;
}

const panel = () => screen.queryByTestId("issue-detail-panel");
const scroller = () => panel()!.querySelector("[class*='overflow-y-auto']") as HTMLElement;

afterEach(() => {
  cleanup();
  pathname = "/practice/speaking/attempt-1";
});

describe("where the panel pins itself", () => {
  it("sits above the navigation bar on a route that shows one", () => {
    show(ISSUE, vi.fn(), "/practice/speaking/attempt-1");

    // The offset is the shared token, so it tracks the bar's height and the
    // Telegram and env() safe areas without naming a device anywhere.
    expect(panel()!.className).toContain("bottom-[var(--bottom-chrome)]");
    expect(panel()!.className).not.toContain("bottom-0");
  });

  it("keeps the bottom edge on a route that hides the bar", () => {
    show(ISSUE, vi.fn(), "/practice/writing/entry-1");

    expect(panel()!.className).toContain("bottom-0");
    expect(panel()!.className).not.toContain("bottom-[var(--bottom-chrome)]");
    // And reserves the device's own inset itself, since no bar is doing it.
    expect(panel()!.className).toContain("pb-[calc(var(--safe-bottom)+1.25rem)]");
  });

  it("never hard-codes a pixel offset for a particular phone", () => {
    for (const route of ["/practice/speaking/a", "/practice/writing/b"]) {
      cleanup();
      show(ISSUE, vi.fn(), route);
      expect(panel()!.className, route).not.toMatch(/bottom-\[\d+px\]/);
    }
  });

  it("stays inside the app's own column rather than spanning a wide screen", () => {
    show(ISSUE);
    expect(panel()!.className).toContain("max-w-[var(--app-width)]");
  });
});

describe("an explanation longer than the space for it", () => {
  it("is bounded rather than growing off the top of the screen", () => {
    show(LONG_ISSUE);

    const className = scroller().className;
    expect(className).toContain("max-h-[");
    // Measured against Telegram's stable viewport, with a browser fallback, so
    // it shrinks with the window instead of assuming a phone height.
    expect(className).toContain("var(--app-height,100dvh)");
  });

  it("scrolls inside the panel", () => {
    show(LONG_ISSUE);
    expect(scroller().className).toContain("overflow-y-auto");
  });

  it("does not chain that scroll to the document underneath", () => {
    // Without this, a flick inside the panel scrolls the sentence being
    // explained out from under the reader.
    show(LONG_ISSUE);
    expect(scroller().className).toContain("overscroll-contain");
  });

  it("leaves the close button outside the scrolling area, always reachable", () => {
    show(LONG_ISSUE);

    const close = screen.getByRole("button", { name: "Close correction" });
    expect(scroller().contains(close)).toBe(false);
    expect(panel()!.contains(close)).toBe(true);
  });

  it("keeps the quoted phrase and its correction at the top of what scrolls", () => {
    show(LONG_ISSUE);

    const text = scroller().textContent ?? "";
    expect(text.indexOf(LONG_ISSUE.originalFragment)).toBe(0);
    expect(text.indexOf(LONG_ISSUE.suggestion)).toBeLessThan(text.indexOf("После слова"));
  });
});

describe("using the panel", () => {
  it("shows nothing at all when no phrase is selected", () => {
    show(null);
    expect(panel()).toBeNull();
  });

  it("swaps its content when another phrase is chosen, without unmounting", () => {
    const { rerender } = render(
      <LocaleProvider language="en">
        <IssueDetailPanel issue={ISSUE} onClose={vi.fn()} />
      </LocaleProvider>,
    );
    expect(screen.getByText("I went")).toBeDefined();

    rerender(
      <LocaleProvider language="en">
        <IssueDetailPanel issue={LONG_ISSUE} onClose={vi.fn()} />
      </LocaleProvider>,
    );

    expect(panel()).not.toBeNull();
    expect(screen.getByText(LONG_ISSUE.suggestion)).toBeDefined();
    expect(screen.queryByText("I went")).toBeNull();
  });

  it("closes from its own button", () => {
    const onClose = show(ISSUE);
    fireEvent.click(screen.getByRole("button", { name: "Close correction" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = show(ISSUE);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is not a modal: no backdrop, and nothing behind it is blocked", () => {
    // The whole point of the panel — tapping a second underlined phrase has to
    // reach the text, not an overlay.
    show(ISSUE);

    expect(panel()!.getAttribute("aria-modal")).toBeNull();
    expect(panel()!.className).not.toContain("inset-0");
    expect(document.body.style.overflow).toBe("");
  });

  it("announces itself as a region, and announces a swap", () => {
    show(ISSUE);
    expect(screen.getByRole("region", { name: "Correction" })).toBeDefined();
    expect(panel()!.getAttribute("aria-live")).toBe("polite");
  });
});
