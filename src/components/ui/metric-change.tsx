import { cn } from "@/lib/cn";
import { formatPercentSigned, formatPercentWorded } from "@/lib/format";

type MetricChangeProps = {
  /** Signed percentage change. */
  percent: number;
  /**
   * Whether the movement is an improvement. Direction and desirability are
   * separate: fewer errors is a fall and still good news.
   */
  improved: boolean;
  /** Trailing context that completes the sentence, e.g. "from last week". */
  context?: string;
  /** "signed" → "+18%". "worded" → "Down 22%", for opening a sentence. */
  phrasing?: "signed" | "worded";
  className?: string;
};

/**
 * A change in a number, written as a sentence.
 *
 * Deliberately not a pill: no capsule, no border, no arrow glyph. The sign or
 * the verb carries the direction and the colour carries the verdict.
 */
export function MetricChange({
  percent,
  improved,
  context,
  phrasing = "signed",
  className,
}: MetricChangeProps) {
  const value = phrasing === "worded" ? formatPercentWorded(percent) : formatPercentSigned(percent);

  return (
    <p className={cn("text-[0.875rem] leading-snug", className)}>
      <span className={cn("font-semibold", improved ? "text-accent" : "text-negative")}>
        {value}
      </span>
      {context ? <span className="text-muted"> {context}</span> : null}
    </p>
  );
}
