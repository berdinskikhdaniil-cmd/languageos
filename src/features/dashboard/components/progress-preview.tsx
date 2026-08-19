import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { AccuracySummary } from "@/features/mistakes/components/accuracy-summary";
import type { WritingAccuracyTrend } from "@/features/mistakes/domain/accuracy";
import { DEFAULT_UI_LANGUAGE, type UiLanguage } from "@/lib/i18n/locale";
import type { Messages } from "@/lib/i18n/messages";

/**
 * Proof that the language itself is changing, not just that time was logged.
 *
 * Real now, and the same component the Progress screen draws — one set of
 * numbers, so the two screens cannot say different things about the same
 * thirty days. All this file adds is the way through to the rest of it.
 *
 * No card: the metric label and the spacing are enough separation.
 */
export function ProgressPreview({
  trend,
  messages,
  language = DEFAULT_UI_LANGUAGE,
}: {
  trend: WritingAccuracyTrend;
  messages: Messages;
  language?: UiLanguage;
}) {
  return (
    <AccuracySummary
      trend={trend}
      period="30d"
      messages={messages}
      language={language}
      action={
        <Link
          href="/progress"
          className="-mr-1 flex items-center gap-0.5 py-1 pl-2 pr-1 text-[0.8125rem] leading-none text-muted transition-colors active:text-fg"
        >
          {messages.dashboard.allProgress}
          <ChevronRight size={14} strokeWidth={2} aria-hidden />
        </Link>
      }
    />
  );
}
