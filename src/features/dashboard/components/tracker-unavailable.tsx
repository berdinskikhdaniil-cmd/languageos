import type { Messages } from "@/lib/i18n/messages";

/** Typed into a shell, not read: the same in every language. */
const START_COMMAND = "npm run db:up";

/**
 * Shown when the tracker cannot be read at all — almost always a database that
 * is not running. It says what to do instead of pretending the numbers are zero.
 *
 * The sentence comes from the dictionary with the command in it, and is split
 * back apart here so the command can be lifted out of the muted text. Doing it
 * this way rather than with two half-sentences keeps the translation readable as
 * a sentence, which is the only way to translate one correctly.
 */
export function TrackerUnavailable({ messages }: { messages: Messages }) {
  const [before, after] = messages.dashboard.unavailableBody(START_COMMAND).split(START_COMMAND);

  return (
    <section className="rounded-[var(--radius-card)] bg-surface p-5">
      <p className="text-[1.0625rem] font-semibold leading-snug">
        {messages.dashboard.unavailableTitle}
      </p>
      <p className="mt-2 text-[0.9375rem] leading-[1.5] text-muted">
        {before}
        <span className="text-fg">{START_COMMAND}</span>
        {after}
      </p>
    </section>
  );
}
