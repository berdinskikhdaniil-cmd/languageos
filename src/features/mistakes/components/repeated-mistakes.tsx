import type { Messages } from "@/lib/i18n/messages";
import type { RepeatedMistake } from "../domain/aggregate";
import { skillDisplayName } from "../domain/label";
import { mistakeDetailHref } from "../domain/links";
import type { MistakePeriod } from "../domain/period";
import { MistakeRow } from "./mistake-row";
import { sourceBreakdown } from "./source-breakdown";

/**
 * The skills a learner keeps getting wrong.
 *
 * The heart of the screen, and the strictest block on it. A skill appears only
 * once it has come up at least twice, because "repeated" is a claim and one
 * occurrence does not support it. Labels group after normalising case and
 * spacing and after nothing else: "past tense" and "irregular verb" stay two
 * rows, because they are two weak points, and a merge nobody can justify would
 * be a lie told in a bigger font.
 *
 * Common labels get a readable name in the reader's language; anything else is
 * shown exactly as the model wrote it, which is also exactly what is stored.
 *
 * Drawn as the same rows as the weak points above, because it is the same kind
 * of thing — a way into the history — cut a different way.
 */
export function RepeatedMistakes({
  items,
  period,
  messages,
}: {
  items: RepeatedMistake[];
  period: MistakePeriod;
  messages: Messages;
}) {
  return (
    <section>
      <h2 className="text-[1.0625rem] font-bold tracking-[-0.02em]">
        {messages.progress.repeated}
      </h2>

      {items.length === 0 ? (
        <p className="mt-2 text-[0.9375rem] leading-snug text-muted">
          {messages.progress.repeatedEmpty}
        </p>
      ) : (
        <>
          <p className="mt-1 text-[0.8125rem] leading-snug text-faint">
            {messages.progress.repeatedNote}
          </p>

          <ul className="mt-3 flex flex-col gap-2">
            {items.map((item) => (
              <MistakeRow
                key={item.key}
                href={mistakeDetailHref({ kind: "skill", key: item.key }, period)}
                title={skillDisplayName(item.key, item.label, messages.progress.skills)}
                detail={messages.progress.mistakeCount(item.mistakes)}
                meta={sourceBreakdown(item.bySource, messages)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
