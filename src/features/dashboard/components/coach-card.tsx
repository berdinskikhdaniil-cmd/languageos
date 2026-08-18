import { Mic } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { CoachInsight } from "../types";

/**
 * One reading of the learner's own data, plus the single next useful action.
 *
 * Starts straight in on the observation: no "Coach" overline, no marker dot and
 * no outline — its own surface tone is what separates it from the page. It
 * should read as a recommendation, not an alert.
 *
 * Content is fixed for now; a real coach reads the tracker in a later iteration.
 */
export function CoachCard({ insight }: { insight: CoachInsight }) {
  return (
    <Card className="bg-surface-accent">
      <p className="text-[1.125rem] font-semibold leading-[1.35] tracking-[-0.02em]">
        {insight.headline}
      </p>
      <p className="mt-1.5 text-[1.0625rem] leading-[1.45] text-muted">{insight.detail}</p>

      <Link
        href={insight.actionHref}
        className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-full bg-accent/15 px-4 text-[0.8125rem] font-semibold text-accent transition-colors active:bg-accent/25"
      >
        <Mic size={15} strokeWidth={2} aria-hidden />
        {insight.actionLabel}
      </Link>
    </Card>
  );
}
