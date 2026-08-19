import type { PracticeVerdict } from "./grading";

/**
 * How each verdict looks, decided once.
 *
 * Three tones drawn from the palette the feedback screens already use: the
 * product's own green for right, the warm amber that marks "not what we
 * expected but not wrong" everywhere else, and the coral reserved for something
 * that actually needs fixing. No fourth treatment, no badge, no pill, and no
 * celebration — this is somebody's practice, not a game.
 *
 * The classes reference tokens from globals.css, never a hex value. Keeping the
 * mapping here rather than inside a component is what makes it testable and what
 * stops a fourth tone appearing somewhere by accident.
 */
const CLASSES: Record<PracticeVerdict, string> = {
  correct: "text-accent",
  acceptable: "text-severity-awkward",
  incorrect: "text-severity-error",
};

export function verdictClass(verdict: PracticeVerdict): string {
  return CLASSES[verdict];
}
