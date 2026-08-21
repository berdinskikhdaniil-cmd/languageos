"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { generatePracticeExercisesAction, practiceSessionStatusAction } from "../actions";
import { PracticeWaiting } from "./practice-waiting";

/**
 * The screen a learner lands on the instant they tap Practise.
 *
 * It is also what *causes* the exercises to be built. That is the whole shape of
 * this iteration: the tap used to do the work and the navigation happened
 * afterwards, so fifteen seconds passed with nothing on screen changing. Now the
 * tap only opens a session, the learner arrives here immediately, and the
 * request that takes fifteen seconds is one this screen makes on their behalf —
 * with something to look at while it runs.
 *
 * Asking is unconditional and safe. `generatePracticeExercisesAction` is
 * idempotent: a set that already exists costs nothing, a set somebody else is
 * mid-call on is reported as such, and only a genuinely unclaimed one is taken
 * on. So this component never has to work out whether a call is already out —
 * on a first visit, on a reopen, or as the loser of a double tap, it simply
 * asks and the server decides.
 *
 * Two things end the wait. Usually the request itself: it returns, and the page
 * is refreshed into the first exercise. The poll is for everything else — the
 * Mini App that was closed and reopened while another request finished the work,
 * or the browser that dropped a long-running connection. And because a request
 * really can vanish mid-call, the ask is repeated occasionally: once the claim
 * it left behind goes stale, that repeat is what picks the work back up rather
 * than leaving somebody in front of a set nobody is building.
 */

/** Often enough to feel immediate, rarely enough to be free. */
const POLL_MS = 2000;

/** Long enough that it never races the real request; short enough to rescue. */
const REASK_MS = 15_000;

export function PracticeGenerating({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  /** Survives re-renders so two timers can agree to stop exactly once. */
  const settled = useRef(false);

  useEffect(() => {
    settled.current = false;

    const finish = () => {
      if (settled.current) return;
      settled.current = true;
      clearInterval(pollTimer);
      clearInterval(reaskTimer);
      // The exercises are rows now. The page re-reads them and this component
      // is replaced by the first one.
      router.refresh();
    };

    const ask = async () => {
      const result = await generatePracticeExercisesAction(sessionId);
      if (settled.current) return;

      /**
       * `generating` coming back means another request owns the call — this one
       * did nothing and must keep waiting. Everything else is an outcome: a set
       * that now exists, or a failure the page will render with a retry.
       */
      const stillWaiting = !result.ok && "failure" in result && result.failure === "generating";
      if (!stillWaiting) finish();
    };

    const poll = async () => {
      const state = await practiceSessionStatusAction(sessionId);
      // A read that did not answer is not news; the next tick will ask again.
      if (state && state.status !== "generating") finish();
    };

    const pollTimer = setInterval(() => void poll(), POLL_MS);
    const reaskTimer = setInterval(() => void ask(), REASK_MS);
    void ask();

    return () => {
      settled.current = true;
      clearInterval(pollTimer);
      clearInterval(reaskTimer);
    };
  }, [router, sessionId]);

  return <PracticeWaiting phase="generating" />;
}
