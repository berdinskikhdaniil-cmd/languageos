"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMessages } from "@/lib/i18n/locale-context";

/**
 * The two waits, named separately.
 *
 * Building exercises and checking answers take different lengths of time and
 * fail in different ways, so a single spinner labelled "working" would leave
 * somebody watching a blank screen wondering which half was slow.
 *
 * This screen is only ever reached the long way round — by reloading, or by
 * being the second of two taps — because in the ordinary flow the request that
 * does the work is the one the learner is waiting on. So it polls: the work is
 * happening in another request, and nothing would otherwise tell this one that
 * it had finished.
 */
const POLL_MS = 3000;

export function PracticePending({ phase }: { phase: "generating" | "grading" }) {
  const router = useRouter();
  const messages = useMessages();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="flex min-h-[60vh] flex-col justify-center">
      <p className="text-[1.25rem] font-semibold leading-snug tracking-[-0.02em]">
        {phase === "generating"
          ? messages.mistakePractice.preparing
          : messages.mistakePractice.checking}
      </p>
      <p className="mt-2.5 max-w-[22rem] text-[0.9375rem] leading-[1.5] text-muted">
        {messages.mistakePractice.preparingNote}
      </p>
    </div>
  );
}
