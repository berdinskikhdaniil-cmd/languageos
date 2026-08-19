import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { MetricChange } from "@/components/ui/metric-change";
import { SectionHeader } from "@/components/ui/section-header";
import { Sparkline } from "@/components/ui/sparkline";
import { percentChange } from "@/lib/format";
import { DEFAULT_UI_LANGUAGE, type UiLanguage } from "@/lib/i18n/locale";
import type { Messages } from "@/lib/i18n/messages";
import type { AccuracyTrend } from "../types";

/**
 * Proof that the language itself is changing, not just that time was logged.
 * A fall in errors is an improvement, so the change is good news pointing down.
 *
 * No card: the metric label and the spacing are enough separation.
 */
export function ProgressPreview({
  trend,
  messages,
  language = DEFAULT_UI_LANGUAGE,
}: {
  trend: AccuracyTrend;
  messages: Messages;
  language?: UiLanguage;
}) {
  const change = percentChange(trend.to, trend.from);

  return (
    <section>
      <SectionHeader label={trend.label}>
        <Link
          href="/progress"
          className="-mr-1 flex items-center gap-0.5 py-1 pl-2 pr-1 text-[0.8125rem] leading-none text-muted transition-colors active:text-fg"
        >
          {messages.dashboard.allProgress}
          <ChevronRight size={14} strokeWidth={2} aria-hidden />
        </Link>
      </SectionHeader>

      <div className="mt-2 flex items-end justify-between gap-4">
        <p className="text-[2.5rem] font-bold leading-none tracking-[-0.04em]">{trend.to}</p>
        <Sparkline values={trend.series} className="mb-1 h-10 w-[45%] max-w-44" />
      </div>

      <MetricChange
        percent={change}
        improved={change <= 0}
        context={messages.dashboard.demo.trendFrom(trend.from)}
        phrasing="worded"
        language={language}
        className="mt-3"
      />
      <p className="mt-1 text-[0.8125rem] text-faint">{trend.caption}</p>
    </section>
  );
}
