import type { IssueSeverity } from "./review";

/**
 * How each severity looks, decided once.
 *
 * Colour carries severity and only severity: a mistake, something a speaker
 * would not say, and a matter of taste. Category never gets a colour — nine of
 * them would be a legend to memorise, so category and skill are written in
 * words instead.
 *
 * The classes reference tokens from globals.css, never a hex value. Keeping the
 * mapping here rather than inside a component is what makes it testable and
 * what stops a fourth treatment appearing somewhere by accident.
 */

export type SeverityStyle = {
  /** The fragment as it sits in the learner's text, unselected. */
  highlight: string;
  /** The same fragment while its explanation is open. */
  highlightSelected: string;
  /** The quoted original in a detail panel. */
  quote: string;
};

const STYLES: Record<IssueSeverity, SeverityStyle> = {
  error: {
    highlight: "bg-severity-error/12 decoration-severity-error/70",
    highlightSelected: "bg-severity-error/28 decoration-severity-error",
    quote: "text-severity-error",
  },
  awkward: {
    highlight: "bg-severity-awkward/12 decoration-severity-awkward/70",
    highlightSelected: "bg-severity-awkward/28 decoration-severity-awkward",
    quote: "text-severity-awkward",
  },
  style: {
    highlight: "bg-severity-style/12 decoration-severity-style/70",
    highlightSelected: "bg-severity-style/28 decoration-severity-style",
    quote: "text-severity-style",
  },
};

export function severityStyle(severity: IssueSeverity): SeverityStyle {
  return STYLES[severity];
}

/**
 * Shared by every highlight whatever its severity.
 *
 * The underline is the part that does not depend on colour: it is what tells a
 * colour-blind reader, or anyone in bright sunlight, that a phrase can be
 * tapped. Severity tints it; it does not create it.
 */
export const HIGHLIGHT_BASE_CLASS =
  "cursor-pointer rounded-[3px] px-[1px] underline decoration-2 underline-offset-[3px] transition-colors";
