import { describe, expect, it } from "vitest";
import { resolveFragment, resolveFragments, splitByHighlights } from "./fragments";

describe("a fragment that appears once", () => {
  it("is placed exactly", () => {
    const text = "I go to the shop yesterday and buyed bread.";
    expect(resolveFragment(text, "buyed")).toEqual({ start: 31, end: 36 });
    expect(text.slice(31, 36)).toBe("buyed");
  });

  it("is placed at the very start and the very end", () => {
    const text = "Yesterday I buyed";
    expect(resolveFragment(text, "Yesterday")).toEqual({ start: 0, end: 9 });
    expect(resolveFragment(text, "buyed")).toEqual({ start: 12, end: 17 });
  });

  it("is found after its surrounding whitespace is trimmed away", () => {
    // Models like to quote with a stray space attached.
    const text = "The weather is very nice today.";
    expect(resolveFragment(text, "  very nice  ")).toEqual({ start: 15, end: 24 });
  });
});

describe("a fragment that appears more than once", () => {
  it("is not placed, because choosing between them would be a guess", () => {
    const text = "I have a cat. The cat is black. I like the cat.";
    expect(resolveFragment(text, "cat")).toBeNull();
  });

  it("is still placed when the longer quote around it is unique", () => {
    const text = "I have a cat. The cat is black.";
    expect(resolveFragment(text, "The cat is")).toEqual({ start: 14, end: 24 });
  });
});

describe("a fragment that is not there", () => {
  it("is not placed", () => {
    const text = "I go to the shop.";
    expect(resolveFragment(text, "I went to the shop")).toBeNull();
    expect(resolveFragment(text, "")).toBeNull();
    expect(resolveFragment(text, "   ")).toBeNull();
  });

  it("is not placed when the model paraphrased instead of quoting", () => {
    expect(resolveFragment("Ich habe gestern gegangen.", "habe gegangen")).toBeNull();
  });
});

describe("text that is not plain Latin", () => {
  it("places a fragment in Japanese", () => {
    const text = "私は昨日学校に行きました。とても楽しかったです。";
    const span = resolveFragment(text, "とても楽しかった");
    expect(span).not.toBeNull();
    expect(text.slice(span!.start, span!.end)).toBe("とても楽しかった");
  });

  it("places a fragment after an emoji, in the units used to slice", () => {
    // An emoji is two UTF-16 code units, and the offsets have to agree with
    // whatever slices the string later.
    const text = "Great day 🎉 we go to beach";
    const span = resolveFragment(text, "we go");
    expect(span).not.toBeNull();
    expect(text.slice(span!.start, span!.end)).toBe("we go");
  });

  it("places a fragment containing combining marks", () => {
    const text = "Añadí más café que ayer.";
    const span = resolveFragment(text, "más café");
    expect(text.slice(span!.start, span!.end)).toBe("más café");
  });

  it("places a fragment in Arabic, right to left", () => {
    const text = "أنا أذهب إلى المدرسة كل يوم";
    const span = resolveFragment(text, "إلى المدرسة");
    expect(text.slice(span!.start, span!.end)).toBe("إلى المدرسة");
  });
});

describe("resolving a whole review at once", () => {
  it("answers one span per fragment, in order, with nulls kept in place", () => {
    const text = "I buyed bread and go home.";
    expect(resolveFragments(text, ["buyed", "not here", "go home"])).toEqual([
      { start: 2, end: 7 },
      null,
      { start: 18, end: 25 },
    ]);
  });

  it("refuses a second span that would overlap one already taken", () => {
    // Two highlights over the same characters cannot both be drawn.
    const text = "I buyed bread yesterday.";
    const [first, second] = resolveFragments(text, ["buyed bread", "bread"]);

    expect(first).toEqual({ start: 2, end: 13 });
    expect(second).toBeNull();
  });
});

describe("splitting text for display", () => {
  it("reproduces the original exactly, whatever the spans", () => {
    const text = "I buyed bread and go home.";
    const parts = splitByHighlights(text, [
      { span: { start: 2, end: 7 }, issueIndex: 0 },
      { span: { start: 18, end: 25 }, issueIndex: 1 },
    ]);

    expect(parts.map((part) => part.text).join("")).toBe(text);
    expect(parts.filter((part) => part.kind === "highlight").map((part) => part.text)).toEqual([
      "buyed",
      "go home",
    ]);
  });

  it("puts the spans in text order even when they arrive out of order", () => {
    const text = "one two three";
    const parts = splitByHighlights(text, [
      { span: { start: 8, end: 13 }, issueIndex: 1 },
      { span: { start: 0, end: 3 }, issueIndex: 0 },
    ]);

    expect(parts.map((part) => part.text).join("")).toBe(text);
    expect(parts[0]).toEqual({ kind: "highlight", text: "one", issueIndex: 0 });
  });

  it("skips a span that would run past the end rather than corrupting the text", () => {
    const text = "short";
    const parts = splitByHighlights(text, [{ span: { start: 2, end: 99 }, issueIndex: 0 }]);
    expect(parts).toEqual([{ kind: "plain", text: "short" }]);
  });

  it("returns the text untouched when there is nothing to highlight", () => {
    expect(splitByHighlights("plain text", [])).toEqual([{ kind: "plain", text: "plain text" }]);
  });

  it("keeps every character when the whole text is one highlight", () => {
    const parts = splitByHighlights("all", [{ span: { start: 0, end: 3 }, issueIndex: 0 }]);
    expect(parts).toEqual([{ kind: "highlight", text: "all", issueIndex: 0 }]);
  });
});
