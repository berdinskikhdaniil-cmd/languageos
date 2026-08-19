"use client";

import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { displayLanguageName } from "@/lib/i18n/language-names";
import { useMessages, useUiLanguage } from "@/lib/i18n/locale-context";
import { searchLanguages, type SupportedLanguage } from "../domain/languages";
import { OnboardingStep, PrimaryAction } from "./onboarding-step";

/**
 * Step one. A plain list of names — no flags, no tiles, no icons. The whole
 * screen is one question, so the answer should be readable at a glance and
 * tappable without aiming.
 *
 * Search widens the list from the popular fifteen to everything we support, and
 * it searches the names as the reader sees them as well as our own: somebody
 * reading Russian looks for "Немецкий", not for "German".
 */
export function LanguageStep({
  step,
  totalSteps,
  selected,
  onSelect,
  onContinue,
}: {
  step: number;
  totalSteps: number;
  selected: string | null;
  onSelect: (code: string) => void;
  onContinue: () => void;
}) {
  const messages = useMessages();
  const uiLanguage = useUiLanguage();

  const nameFor = useCallback(
    (language: SupportedLanguage) =>
      displayLanguageName(language.code, language.name, uiLanguage),
    [uiLanguage],
  );

  const [query, setQuery] = useState("");
  const results = useMemo(() => searchLanguages(query, nameFor), [query, nameFor]);

  return (
    <OnboardingStep
      step={step}
      totalSteps={totalSteps}
      title={messages.onboarding.languageTitle}
      description={messages.onboarding.languageDescription}
      footer={
        <PrimaryAction onClick={onContinue} disabled={selected === null}>
          {messages.common.continue}
        </PrimaryAction>
      }
    >
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={messages.onboarding.searchLanguages}
        aria-label={messages.onboarding.searchLanguages}
        autoComplete="off"
        className="h-12 w-full rounded-[var(--radius-control)] bg-surface px-4 text-[0.9375rem] text-fg placeholder:text-faint"
      />

      {results.length === 0 ? (
        <p className="mt-6 text-[0.9375rem] leading-[1.5] text-muted">
          {messages.onboarding.noLanguageMatch}
        </p>
      ) : (
        <ul className="mt-3">
          {results.map((language) => (
            <LanguageRow
              key={language.code}
              name={nameFor(language)}
              selected={language.code === selected}
              onSelect={() => onSelect(language.code)}
            />
          ))}
        </ul>
      )}
    </OnboardingStep>
  );
}

function LanguageRow({
  name,
  selected,
  onSelect,
}: {
  name: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          "flex h-14 w-full items-center rounded-[var(--radius-control)] px-4 text-left text-[1.0625rem] transition-colors",
          selected
            ? "bg-accent font-bold text-accent-ink"
            : "font-medium text-fg active:bg-surface",
        )}
      >
        {name}
      </button>
    </li>
  );
}
