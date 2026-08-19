import Link from "next/link";
import { formatElapsed } from "@/lib/format";
import type { UiLanguage } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/messages";
import { localDateLabel } from "@/lib/time";
import type { RecentSpeakingAttempt } from "../data/attempts";

/**
 * A way back to the last few answers.
 *
 * The same list Writing has, for the same reason and in the same shape: three
 * rows separated by hairlines, the status a word in the muted line rather than
 * a badge. Two lists that look different would imply a difference that is not
 * there.
 *
 * The topic is the row's title, because that is what somebody remembers about
 * an answer — not "Speaking, 45 seconds".
 */
export function RecentSpeaking({
  attempts,
  timeZone,
  language,
  now,
}: {
  attempts: RecentSpeakingAttempt[];
  /** The learner's own zone: whether something is "today" depends on it. */
  timeZone: string;
  language: UiLanguage;
  now: Date;
}) {
  if (attempts.length === 0) return null;

  const messages = getMessages(language);

  return (
    <div className="mt-7">
      <h3 className="text-[0.8125rem] font-medium text-muted">
        {messages.speaking.recentSpeaking}
      </h3>

      <ul className="mt-1 divide-y divide-hairline">
        {attempts.map((attempt) => (
          <li key={attempt.id}>
            <Link
              href={`/practice/speaking/${attempt.id}`}
              className="block py-3.5 transition-colors active:bg-surface"
            >
              <span className="block text-[0.9375rem] font-medium leading-snug">
                {attempt.topicPrompt}
              </span>
              <span className="mt-1 block text-[0.8125rem] leading-snug text-faint">
                {localDateLabel(attempt.createdAt, timeZone, now, language)} ·{" "}
                {formatElapsed(attempt.durationSeconds)} ·{" "}
                {messages.speaking.statuses[attempt.status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
