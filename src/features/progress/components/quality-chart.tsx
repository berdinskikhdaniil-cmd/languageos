import type { QualitySeries } from "@/features/mistakes/domain/quality-trend";
import type { Messages } from "@/lib/i18n/messages";

/**
 * The error rate over time, as a line.
 *
 * Every point is a period that held enough reviewed writing to divide by; the
 * ones that did not are absent, and the caption says how many. That is the
 * whole reason this chart is careful — a line through periods of twelve and
 * forty words would swing violently and mean nothing, and it would look exactly
 * as authoritative as a real one.
 *
 * Drawn as a plain polyline in a viewBox that stretches to the container, so it
 * fits any width without measuring anything. The stroke does not scale with it
 * — `vectorEffect` keeps it honest — and the dots are drawn in a second pass so
 * they stay round rather than becoming ellipses.
 *
 * Down is better here, so the line is the accent green: this is the one place
 * in the product where a falling number is the good news.
 */

/**
 * The drawing area, inset on every side.
 *
 * The horizontal inset is not cosmetic: without it the first and last points
 * sit exactly on the container's edges and their dots are drawn half outside
 * it — and the last point is the one a reader looks for first.
 */
const VIEW = { width: 100, height: 100, padX: 3, padY: 8 };

export function QualityChart({
  series,
  messages,
}: {
  series: QualitySeries;
  messages: Messages;
}) {
  const { points } = series;
  if (points.length < 2) return null;

  const values = points.map((point) => point.perThousand);
  const max = Math.max(...values);
  const min = Math.min(...values);
  /** A flat line sits in the middle rather than dividing by zero. */
  const span = max - min || 1;

  const coords = points.map((point, index) => ({
    x: VIEW.padX + (index / (points.length - 1)) * (VIEW.width - VIEW.padX * 2),
    y:
      max === min
        ? VIEW.height / 2
        : VIEW.padY + (1 - (point.perThousand - min) / span) * (VIEW.height - VIEW.padY * 2),
    point,
  }));

  return (
    <div className="mt-5">
      <svg
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        preserveAspectRatio="none"
        className="h-24 w-full"
        aria-hidden
        focusable="false"
      >
        <polyline
          points={coords.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/*
        The dots live in their own square-aspect layer. In the stretched viewBox
        above a circle would be drawn as an ellipse, and the last point — the
        one a reader looks for — would be the most distorted of them.
      */}
      <div aria-hidden className="pointer-events-none relative -mt-24 h-24">
        {coords.map(({ x, y, point }) => (
          <span
            key={point.key}
            className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
            style={{ left: `${x}%`, top: `${y}%` }}
          />
        ))}
      </div>

      <div className="mt-2.5 flex justify-between gap-2 text-[0.6875rem] leading-none text-faint">
        <span className="truncate">{points[0].label}</span>
        <span className="truncate">{points[points.length - 1].label}</span>
      </div>

      {series.thinBuckets > 0 ? (
        <p className="mt-2 text-[0.75rem] leading-snug text-faint">
          {messages.progress.qualityThinPeriods(series.thinBuckets)}
        </p>
      ) : null}

      {/* The accessible version of the line: every point, in order, as text. */}
      <p className="sr-only">
        {messages.progress.breakdown(
          points.map((point) => messages.progress.qualityPoint(point.label, point.perThousand)),
        )}
      </p>
    </div>
  );
}
