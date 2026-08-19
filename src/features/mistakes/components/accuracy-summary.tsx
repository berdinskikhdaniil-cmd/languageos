import type { ReactNode } from "react";
import { MetricChange } from "@/components/ui/metric-change";
import { SectionHeader } from "@/components/ui/section-header";
import { percentChange } from "@/lib/format";
import { DEFAULT_UI_LANGUAGE, type UiLanguage } from "@/lib/i18n/locale";
import type { Messages } from "@/lib/i18n/messages";
import { MIN_ACCURACY_WORDS, comparableAccuracy, type WritingAccuracyTrend } from "../domain/accuracy";
import type { MistakePeriod } from "../domain/period";

/**
 * Mistakes per 1000 words of reviewed writing.
 *
 * The same block on the dashboard and on Progress, from the same numbers, so
 * the two screens cannot disagree about how the learner is doing. `action` is
 * the dashboard's link through to the full screen; `chart` is the trend line
 * Progress puts underneath, which the dashboard has no room for.
 *
 * `tone` is only how loudly the label is set: a quiet caption among the
 * dashboard's other blocks, a section heading on a screen made of sections.
 *
 * A fall is an improvement, so the change is good news pointing down — that is
 * what `improved` is separate from the sign for. And when there is not enough
 * reviewed writing to divide by, the block says so in words rather than
 * printing a confident number computed from forty words.
 */
export function AccuracySummary({
  trend,
  period,
  messages,
  language = DEFAULT_UI_LANGUAGE,
  action,
  chart,
  tone = "compact",
}: {
  trend: WritingAccuracyTrend;
  period: MistakePeriod;
  messages: Messages;
  language?: UiLanguage;
  action?: ReactNode;
  chart?: ReactNode;
  tone?: "compact" | "section";
}) {
  const comparison = comparableAccuracy(trend);

  return (
    <section>
      {tone === "section" ? (
        <h2 className="text-[1.0625rem] font-bold tracking-[-0.02em]">
          {messages.progress.accuracyLabel}
        </h2>
      ) : (
        <SectionHeader label={messages.progress.accuracyLabel}>{action}</SectionHeader>
      )}

      {trend.current.status === "ready" ? (
        <>
          <p className="mt-2 text-[2.5rem] font-bold leading-none tracking-[-0.04em]">
            {trend.current.perThousand}
          </p>

          {comparison ? (
            <MetricChange
              percent={percentChange(comparison.current, comparison.previous)}
              improved={comparison.current <= comparison.previous}
              context={messages.progress.accuracyFrom(comparison.previous)}
              phrasing="worded"
              language={language}
              className="mt-3"
            />
          ) : null}

          <p className={comparison ? "mt-1 text-[0.8125rem] text-faint" : "mt-3 text-[0.8125rem] text-faint"}>
            {messages.progress.accuracyCaption(messages.progress.windowsInline[period])}
          </p>

          {chart}
        </>
      ) : (
        <>
          <p className="mt-2 text-[1.0625rem] font-semibold leading-snug">
            {messages.progress.accuracyInsufficient}
          </p>
          <p className="mt-1.5 max-w-[22rem] text-[0.875rem] leading-snug text-muted">
            {messages.progress.accuracyNeedsWords(MIN_ACCURACY_WORDS)}
          </p>
        </>
      )}
    </section>
  );
}
