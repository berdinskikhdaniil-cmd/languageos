"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FieldError } from "@/components/ui/field-error";
import { cn } from "@/lib/cn";
import type { AppErrorCode } from "@/lib/errors";
import { UI_LANGUAGES, type UiLanguage } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/locale-context";
import { setUiLanguageAction } from "../actions";

/**
 * Two rows, one tap, no Save button.
 *
 * There is nothing to confirm: the choice *is* the change, and a form around a
 * pair of radio buttons would only put a step between the learner and the
 * result. The tapped row shows the new state straight away and the rest of the
 * app follows once the server has written it — but the row does not lie about
 * having saved: a failure puts the selection back where it was and says so.
 *
 * The two names are written in their own languages and are never translated.
 * "Русский" is what somebody looking for Russian is looking for, whatever the
 * interface currently says.
 */
export function InterfaceLanguageSetting({ current }: { current: UiLanguage }) {
  const router = useRouter();
  const messages = useMessages();
  const [selected, setSelected] = useState<UiLanguage>(current);
  const [failure, setFailure] = useState<AppErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  const choose = (language: UiLanguage) => {
    if (language === selected || pending) return;

    const previous = selected;
    setSelected(language);
    setFailure(null);

    startTransition(async () => {
      const result = await setUiLanguageAction(language);

      if (!result.ok) {
        setSelected(previous);
        setFailure(result.code);
        return;
      }

      // The server has the new preference; re-render the tree so every screen,
      // the header and the navigation pick it up.
      router.refresh();
    });
  };

  return (
    <section>
      <h2 className="text-[0.8125rem] font-medium text-muted">
        {messages.settings.interfaceLanguage}
      </h2>

      <ul className="mt-2.5">
        {UI_LANGUAGES.map((language) => {
          const isSelected = language === selected;

          return (
            <li key={language}>
              <button
                type="button"
                aria-pressed={isSelected}
                disabled={pending}
                onClick={() => choose(language)}
                className={cn(
                  "flex h-14 w-full items-center rounded-[var(--radius-control)] px-4 text-left text-[1.0625rem] transition-colors disabled:opacity-70",
                  isSelected
                    ? "bg-accent font-bold text-accent-ink"
                    : "font-medium text-fg active:bg-surface",
                )}
              >
                {messages.settings.languageNames[language]}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[0.8125rem] leading-snug text-faint">
        {messages.settings.interfaceLanguageNote}
      </p>

      <FieldError message={failure ? messages.errors[failure] : null} />
    </section>
  );
}
