import { describe, expect, it } from "vitest";
import { ACTIVITY_GROUPS, ACTIVITY_TYPES } from "@/features/tracker/domain/activity";
import { WRITING_ENTRY_STATUSES } from "@/features/writing/domain/entry-status";
import { ISSUE_CATEGORIES, ISSUE_SEVERITIES } from "@/features/writing/domain/review";
import { WRITING_TYPES } from "@/features/writing/domain/writing-entry";
import { APP_ERROR_CODES } from "@/lib/errors";
import { UI_LANGUAGES } from "./locale";
import { ALL_DICTIONARIES, getMessages } from "./messages";

/**
 * The dictionaries are held together by the compiler — `Messages = typeof en`
 * means a Russian dictionary missing a key does not build. These tests cover
 * what a type cannot say: that no entry is blank, that no Russian entry was
 * left as its English source, and that the records keyed by a domain enum still
 * have a word for every value that enum can take.
 */

type Node = string | ((...args: never[]) => string) | { [key: string]: Node };

/** Every leaf, as "writing.categories.grammar" → the value at it. */
function flatten(node: Node, prefix = ""): Map<string, Node> {
  const out = new Map<string, Node>();

  if (typeof node !== "object") {
    out.set(prefix, node);
    return out;
  }

  for (const [key, child] of Object.entries(node)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    for (const [innerPath, value] of flatten(child, path)) out.set(innerPath, value);
  }

  return out;
}

const FLAT = Object.fromEntries(
  UI_LANGUAGES.map((language) => [language, flatten(ALL_DICTIONARIES[language] as Node)]),
) as Record<(typeof UI_LANGUAGES)[number], Map<string, Node>>;

describe("the two dictionaries", () => {
  it("have exactly the same keys", () => {
    const english = [...FLAT.en.keys()].sort();
    const russian = [...FLAT.ru.keys()].sort();

    expect(russian).toEqual(english);
  });

  it("answer each key with the same kind of thing", () => {
    // A key that is a plain string in one and a function in the other would
    // render "[object Function]" on somebody's screen.
    for (const [path, value] of FLAT.en) {
      expect(typeof FLAT.ru.get(path), path).toBe(typeof value);
    }
  });

  it("have no blank message anywhere", () => {
    for (const language of UI_LANGUAGES) {
      for (const [path, value] of FLAT[language]) {
        if (typeof value !== "string") continue;
        expect(value.trim(), `${language}.${path}`).not.toBe("");
      }
    }
  });

  it("leave functions with the same arity, so no argument is dropped", () => {
    for (const [path, value] of FLAT.en) {
      if (typeof value !== "function") continue;
      const russian = FLAT.ru.get(path);
      expect(typeof russian, path).toBe("function");
      expect((russian as (...args: never[]) => string).length, path).toBe(value.length);
    }
  });
});

describe("the Russian dictionary", () => {
  /**
   * A handful of entries are the same in both on purpose: a language written in
   * its own name, and a brand. Everything else being identical would mean an
   * English string was copied and never translated.
   */
  const DELIBERATELY_SHARED = new Set([
    "settings.languageNames.en",
    "settings.languageNames.ru",
  ]);

  it("does not leave English text sitting in it", () => {
    const untranslated: string[] = [];

    for (const [path, value] of FLAT.en) {
      if (typeof value !== "string" || DELIBERATELY_SHARED.has(path)) continue;
      if (FLAT.ru.get(path) === value) untranslated.push(path);
    }

    expect(untranslated).toEqual([]);
  });

  it("is actually written in Cyrillic", () => {
    for (const [path, value] of FLAT.ru) {
      if (typeof value !== "string" || DELIBERATELY_SHARED.has(path)) continue;
      expect(/[Ѐ-ӿ]/.test(value), `ru.${path}`).toBe(true);
    }
  });
});

describe("the records keyed by a stored identifier", () => {
  const CASES: [string, readonly string[], (language: "en" | "ru") => Record<string, string>][] = [
    ["activity types", ACTIVITY_TYPES, (l) => getMessages(l).tracker.activityTypes],
    ["activity groups", ACTIVITY_GROUPS, (l) => getMessages(l).tracker.activityGroups],
    ["writing types", WRITING_TYPES, (l) => getMessages(l).writing.types],
    ["entry statuses", WRITING_ENTRY_STATUSES, (l) => getMessages(l).writing.entryStatuses],
    ["issue categories", ISSUE_CATEGORIES, (l) => getMessages(l).writing.categories],
    ["issue severities", ISSUE_SEVERITIES, (l) => getMessages(l).writing.severities],
    ["error codes", APP_ERROR_CODES, (l) => getMessages(l).errors],
  ];

  for (const [name, values, lookup] of CASES) {
    it(`have a word for every one of the ${name}`, () => {
      for (const language of UI_LANGUAGES) {
        const record = lookup(language);
        expect(Object.keys(record).sort()).toEqual([...values].sort());
        for (const value of values) {
          expect(record[value]?.trim(), `${language}.${value}`).toBeTruthy();
        }
      }
    });
  }
});

describe("looking a dictionary up", () => {
  it("answers in the language asked for", () => {
    expect(getMessages("en").nav.home).toBe("Home");
    expect(getMessages("ru").nav.home).toBe("Главная");
  });

  it("falls back to English when nothing was asked for", () => {
    expect(getMessages()).toBe(getMessages("en"));
  });
});
