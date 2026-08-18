"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { searchLanguages, type SupportedLanguage } from "../domain/languages";
import { OnboardingStep, PrimaryAction } from "./onboarding-step";

/**
 * Step one. A plain list of names — no flags, no tiles, no icons. The whole
 * screen is one question, so the answer should be readable at a glance and
 * tappable without aiming.
 *
 * Search widens the list from the popular fifteen to everything we support.
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
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchLanguages(query), [query]);

  return (
    <OnboardingStep
      step={step}
      totalSteps={totalSteps}
      title="What language are you learning?"
      description="Everything you track, practise and review is filed under it."
      footer={
        <PrimaryAction onClick={onContinue} disabled={selected === null}>
          Continue
        </PrimaryAction>
      }
    >
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search languages"
        aria-label="Search languages"
        autoComplete="off"
        className="h-12 w-full rounded-[var(--radius-control)] bg-surface px-4 text-[0.9375rem] text-fg placeholder:text-faint"
      />

      {results.length === 0 ? (
        <p className="mt-6 text-[0.9375rem] leading-[1.5] text-muted">
          No match. Try the language&rsquo;s English name — or tell us and we will add it.
        </p>
      ) : (
        <ul className="mt-3">
          {results.map((language) => (
            <LanguageRow
              key={language.code}
              language={language}
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
  language,
  selected,
  onSelect,
}: {
  language: SupportedLanguage;
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
        {language.name}
      </button>
    </li>
  );
}
