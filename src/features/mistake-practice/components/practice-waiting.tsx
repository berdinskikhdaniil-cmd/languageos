"use client";

import { useEffect, useState } from "react";
import { useMessages } from "@/lib/i18n/locale-context";

/**
 * What waiting looks like, in the one place both waits use it.
 *
 * Building a set and checking a set are different lengths and different
 * failures, and they say so — but they are the same *shape* of moment, so they
 * are one component rather than two that would drift apart. The learner who
 * has seen one recognises the other.
 *
 * Three things carry the message, in order of how much work they do:
 *
 * A sentence saying what is happening, in plain words. A sweeping line, because
 * something has to move or a still screen reads as a stopped one. And, once the
 * wait stops feeling instant, a count of the seconds — which is the part that
 * actually survives `prefers-reduced-motion`, where the line is frozen by the
 * global rule in globals.css and could not prove anything on its own.
 *
 * What is deliberately absent: a percentage, a filling bar, numbered steps and
 * a rotating carousel of encouragement. Nothing here knows how much of a
 * provider call is done, and a bar that implied otherwise would be inventing
 * the one number the learner would actually rely on.
 */

/** Below this, a counter is noise: the wait has not started to feel long yet. */
const COUNTER_AFTER_MS = 5000;

export function PracticeWaiting({ phase }: { phase: "generating" | "grading" }) {
  const messages = useMessages();
  const seconds = useElapsedSeconds();

  const copy =
    phase === "generating"
      ? {
          title: messages.mistakePractice.preparing,
          body: messages.mistakePractice.preparingBody,
          elapsed: messages.mistakePractice.preparingElapsed,
        }
      : {
          title: messages.mistakePractice.checking,
          body: messages.mistakePractice.checkingBody,
          elapsed: messages.mistakePractice.checkingElapsed,
        };

  return (
    <section className="flex min-h-[55vh] flex-col justify-center">
      <h2 className="text-[1.25rem] font-semibold leading-snug tracking-[-0.02em]">
        {copy.title}
      </h2>
      <p className="mt-2.5 max-w-[22rem] text-[0.9375rem] leading-[1.5] text-muted">{copy.body}</p>

      <div
        role="status"
        aria-live="polite"
        aria-label={copy.title}
        className="mt-7 h-[3px] w-full overflow-hidden rounded-full bg-data-ghost"
      >
        <div className="h-full w-1/5 rounded-full bg-accent animate-sweep" />
      </div>

      <p className="mt-4 min-h-[1.25rem] text-[0.8125rem] leading-snug text-faint">
        {seconds * 1000 >= COUNTER_AFTER_MS
          ? copy.elapsed(seconds)
          : messages.mistakePractice.usuallySeconds}
      </p>
    </section>
  );
}

/**
 * Seconds since this screen appeared.
 *
 * Deliberately counted from mount rather than from a timestamp on the session:
 * the honest thing to tell somebody is how long *they* have been waiting, and a
 * session that was opened, abandoned and reopened has been waiting far longer
 * than the person now looking at it.
 */
function useElapsedSeconds(): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return seconds;
}
