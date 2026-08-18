type SparklineProps = {
  values: number[];
  /** Any CSS colour. Defaults to the accent. */
  stroke?: string;
  className?: string;
};

/**
 * Decorative trend line. The number beside it carries the meaning, so the
 * sparkline stays hidden from assistive technology.
 */
export function Sparkline({ values, stroke = "var(--accent)", className }: SparklineProps) {
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;

  // Inset vertically so the round caps are not clipped by the viewBox.
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 94 - ((value - min) / span) * 88;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={className}
      aria-hidden
      focusable="false"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
