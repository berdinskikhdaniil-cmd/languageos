"use client";

import { Mic, PenLine, Play, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ActiveSessionView } from "../data/overview";
import { ActiveSessionPanel } from "./active-session-panel";
import { ManualSessionSheet } from "./manual-session-sheet";
import { StartSessionSheet } from "./start-session-sheet";

type TrackerActionsProps = {
  activeSession: ActiveSessionView | null;
  todayDayKey: string;
};

const TILE_CLASS =
  "flex h-[4.25rem] flex-col items-center justify-center gap-2 rounded-[var(--radius-tile)] bg-surface text-muted transition-colors active:bg-surface-raised";

/**
 * The thumb zone of the dashboard. Only the primary control changes with state:
 * either "Start session" or the running timer. The secondary row stays put, so
 * time can still be logged by hand while a timer runs.
 */
export function TrackerActions({ activeSession, todayDayKey }: TrackerActionsProps) {
  const [sheet, setSheet] = useState<"start" | "manual" | null>(null);
  const closeSheet = () => setSheet(null);

  return (
    <section aria-label="Tracker" className="flex flex-col gap-2">
      {activeSession ? (
        <ActiveSessionPanel session={activeSession} />
      ) : (
        <button
          type="button"
          onClick={() => setSheet("start")}
          className="flex h-14 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-accent text-[0.9375rem] font-bold tracking-[-0.01em] text-accent-ink transition-colors active:bg-accent-pressed"
        >
          <Play size={15} strokeWidth={1} fill="currentColor" aria-hidden />
          Start session
        </button>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Link href="/practice" className={TILE_CLASS}>
          <Mic size={18} strokeWidth={1.8} aria-hidden />
          <span className="text-[0.75rem] font-medium leading-none">Speaking</span>
        </Link>
        <Link href="/practice" className={TILE_CLASS}>
          <PenLine size={18} strokeWidth={1.8} aria-hidden />
          <span className="text-[0.75rem] font-medium leading-none">Write</span>
        </Link>
        <button type="button" onClick={() => setSheet("manual")} className={TILE_CLASS}>
          <Plus size={18} strokeWidth={1.8} aria-hidden />
          <span className="text-[0.75rem] font-medium leading-none">Add manually</span>
        </button>
      </div>

      <StartSessionSheet open={sheet === "start"} onClose={closeSheet} />
      <ManualSessionSheet
        open={sheet === "manual"}
        onClose={closeSheet}
        todayDayKey={todayDayKey}
      />
    </section>
  );
}
