/**
 * Turning the model's quoted fragments into positions in the learner's text.
 *
 * The model is asked for the exact substring it is talking about, never for
 * character indexes: a language model counting UTF-16 offsets is a guess, and a
 * guess would underline the wrong words with total confidence. So we search for
 * the fragment ourselves, deterministically.
 *
 * Two rules follow from that. The original text is never altered to make a
 * fragment fit — the learner's words are the record. And a fragment we cannot
 * place unambiguously costs that issue its highlight, nothing more: the issue
 * is still shown, explained and stored.
 *
 * Offsets are UTF-16 code units, the same units `String.prototype.slice` uses,
 * so a span can be rendered by slicing without any further conversion.
 */

export type FragmentSpan = { start: number; end: number };

/**
 * Where a fragment sits in the text, or null when that cannot be answered.
 *
 * Null means one of three things, all handled the same way: the fragment is not
 * there at all (the model paraphrased), it is empty, or it appears more than
 * once and we would be choosing between them.
 */
export function resolveFragment(text: string, fragment: string): FragmentSpan | null {
  return locate(text, fragment) ?? locate(text, fragment.trim());
}

function locate(text: string, fragment: string): FragmentSpan | null {
  if (fragment === "") return null;

  const start = text.indexOf(fragment);
  if (start === -1) return null;

  // A second occurrence makes the choice arbitrary, so we decline to make it.
  if (text.indexOf(fragment, start + 1) !== -1) return null;

  return { start, end: start + fragment.length };
}

/**
 * Resolves a whole review's fragments at once.
 *
 * Beyond placing each one, this drops any span that overlaps a span already
 * accepted. Two highlights covering the same characters cannot both be drawn,
 * and silently nesting them produces mangled text; the earlier issue keeps its
 * highlight and the later one simply loses its own.
 */
export function resolveFragments(text: string, fragments: readonly string[]): (FragmentSpan | null)[] {
  const accepted: FragmentSpan[] = [];

  return fragments.map((fragment) => {
    const span = resolveFragment(text, fragment);
    if (!span) return null;
    if (accepted.some((taken) => overlaps(taken, span))) return null;

    accepted.push(span);
    return span;
  });
}

function overlaps(a: FragmentSpan, b: FragmentSpan): boolean {
  return a.start < b.end && b.start < a.end;
}

export type TextPart =
  | { kind: "plain"; text: string }
  | { kind: "highlight"; text: string; issueIndex: number };

/**
 * Splits the text into the pieces a highlighted view renders.
 *
 * Doing it here rather than in the component keeps the one piece of logic that
 * can visibly corrupt the learner's writing — slicing it — pure and tested.
 * Every character of the original appears exactly once in the output, in order.
 */
export function splitByHighlights(
  text: string,
  spans: readonly { span: FragmentSpan; issueIndex: number }[],
): TextPart[] {
  const ordered = [...spans].sort((a, b) => a.span.start - b.span.start);
  const parts: TextPart[] = [];
  let cursor = 0;

  for (const { span, issueIndex } of ordered) {
    // Defensive: a span outside the text, or one that overlaps the previous,
    // would corrupt the output. Skipping it loses a highlight, never a word.
    if (span.start < cursor || span.end > text.length || span.start >= span.end) continue;

    if (span.start > cursor) {
      parts.push({ kind: "plain", text: text.slice(cursor, span.start) });
    }
    parts.push({ kind: "highlight", text: text.slice(span.start, span.end), issueIndex });
    cursor = span.end;
  }

  if (cursor < text.length) parts.push({ kind: "plain", text: text.slice(cursor) });

  return parts;
}
