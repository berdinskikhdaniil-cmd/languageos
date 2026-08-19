"use client";

import { useEffect, useState } from "react";
import { formatElapsed } from "@/lib/format";
import { useMessages } from "@/lib/i18n/locale-context";

/**
 * Renders a running clock from a server-provided baseline.
 *
 * Each tick recomputes the total from a fixed reference instead of incrementing,
 * so a throttled background tab catches up rather than falling behind. The
 * baseline comes from the server, which keeps the reading immune to a client
 * clock that disagrees.
 *
 * Callers pass `key={baselineSeconds}` so a fresh server render restarts this
 * component with the new baseline instead of waiting a tick to correct itself.
 */
export function ElapsedTime({ baselineSeconds }: { baselineSeconds: number }) {
  const messages = useMessages();
  const [seconds, setSeconds] = useState(baselineSeconds);

  useEffect(() => {
    const tickingSince = Date.now();
    const id = window.setInterval(() => {
      setSeconds(baselineSeconds + Math.round((Date.now() - tickingSince) / 1000));
    }, 1000);

    return () => window.clearInterval(id);
  }, [baselineSeconds]);

  return (
    <>
      <span aria-hidden>{formatElapsed(seconds)}</span>
      <span className="sr-only">{messages.tracker.minutesElapsed(Math.floor(seconds / 60))}</span>
    </>
  );
}
