"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  formatTimeInZone,
  formatTimeZoneLabel,
  listTimeZones,
} from "../domain/timezone";
import { OnboardingStep, PrimaryAction } from "./onboarding-step";

/**
 * Step two. Telegram never tells us where the learner is, so the device does —
 * and then the learner confirms it, because a wrong zone quietly puts a whole
 * evening of study on the wrong day.
 *
 * When the browser will not say, the list opens straight away. There is no
 * silent fallback to a server default: guessing a country is worse than asking.
 */

/** Long lists are worse than no list. Search is the way through 400 zones. */
const MAX_VISIBLE_ZONES = 60;

export function TimezoneStep({
  step,
  totalSteps,
  detected,
  value,
  onChange,
  onContinue,
  onBack,
}: {
  step: number;
  totalSteps: number;
  /** What the device reported, or null when it reported nothing. */
  detected: string | null;
  value: string | null;
  onChange: (zone: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const [picking, setPicking] = useState(detected === null);
  const [query, setQuery] = useState("");

  /**
   * A zone's local clock is the fastest way to spot a wrong guess. Read at
   * first render and kept current after that — this step is only ever reached
   * by tapping Continue, so it is never part of the server's HTML and the
   * clock cannot disagree with it.
   */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const zones = useMemo(() => listTimeZones(), []);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/\s+/g, "_");
    if (needle === "") return zones.slice(0, MAX_VISIBLE_ZONES);
    return zones.filter((zone) => zone.toLowerCase().includes(needle)).slice(0, MAX_VISIBLE_ZONES);
  }, [zones, query]);

  const localTime = value ? formatTimeInZone(value, now) : null;
  const unchanged = value !== null && value === detected;

  if (picking) {
    return (
      <OnboardingStep
        step={step}
        totalSteps={totalSteps}
        title="Where are you?"
        description="Pick the city closest to you. Daylight saving is handled for you."
        onBack={onBack}
        footer={
          <PrimaryAction onClick={onContinue} disabled={value === null}>
            Continue
          </PrimaryAction>
        }
      >
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search cities and regions"
          aria-label="Search timezones"
          autoComplete="off"
          className="h-12 w-full rounded-[var(--radius-control)] bg-surface px-4 text-[0.9375rem] text-fg placeholder:text-faint"
        />

        {results.length === 0 ? (
          <p className="mt-6 text-[0.9375rem] leading-[1.5] text-muted">
            No zone matches that. Try a nearby capital.
          </p>
        ) : (
          <ul className="mt-3">
            {results.map((zone) => {
              const selected = zone === value;
              return (
                <li key={zone}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      onChange(zone);
                      setPicking(false);
                    }}
                    className={cn(
                      "flex h-14 w-full items-center justify-between gap-3 rounded-[var(--radius-control)] px-4 text-left transition-colors",
                      selected
                        ? "bg-accent text-accent-ink"
                        : "text-fg active:bg-surface",
                    )}
                  >
                    <span
                      className={cn(
                        "min-w-0 truncate text-[1rem]",
                        selected ? "font-bold" : "font-medium",
                      )}
                    >
                      {formatTimeZoneLabel(zone)}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-[0.8125rem]",
                        selected ? "text-accent-ink/70" : "text-faint",
                      )}
                    >
                      {formatTimeInZone(zone, now)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {zones.length > results.length && query.trim() === "" ? (
          <p className="mt-4 text-[0.8125rem] leading-snug text-faint">
            Start typing to search all {zones.length} zones.
          </p>
        ) : null}
      </OnboardingStep>
    );
  }

  return (
    <OnboardingStep
      step={step}
      totalSteps={totalSteps}
      title="Your timezone"
      description="We use this to calculate your days, weeks and streaks correctly."
      onBack={onBack}
      footer={
        <PrimaryAction onClick={onContinue} disabled={value === null}>
          {unchanged ? "Looks right" : "Continue"}
        </PrimaryAction>
      }
    >
      <p className="text-[1.5rem] font-bold leading-tight tracking-[-0.025em]">
        {value ? formatTimeZoneLabel(value) : "Unknown"}
      </p>
      <p className="mt-2 text-[0.9375rem] text-muted">
        {localTime ? `It is ${localTime} there right now.` : "We could not read the local time."}
      </p>

      <button
        type="button"
        onClick={() => {
          setQuery("");
          setPicking(true);
        }}
        className="mt-6 h-12 rounded-[var(--radius-control)] bg-surface px-5 text-[0.9375rem] font-semibold text-fg transition-colors active:bg-surface-raised"
      >
        Change
      </button>
    </OnboardingStep>
  );
}
