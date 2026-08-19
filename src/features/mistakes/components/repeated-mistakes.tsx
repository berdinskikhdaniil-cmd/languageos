import Link from "next/link";
import type { Messages } from "@/lib/i18n/messages";
import type { RepeatedMistake } from "../domain/aggregate";
import { skillDisplayName } from "../domain/label";
import { mistakeDetailHref } from "../domain/links";
import type { MistakePeriod } from "../domain/period";

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

          <ul className="mt-2 divide-y divide-hairline">
            {items.map((item) => (
              <li key={item.key}>
                <Link
                  href={mistakeDetailHref({ kind: "skill", key: item.key }, period)}
                  className="block py-3.5 transition-colors active:bg-surface"
                >
                  <span className="block text-[0.9375rem] font-medium leading-snug">
                    {skillDisplayName(item.key, item.label, messages.progress.skills)}
                  </span>
                  <span className="mt-1 block text-[0.8125rem] leading-snug text-faint">
                    {messages.progress.mistakeCount(item.mistakes)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
