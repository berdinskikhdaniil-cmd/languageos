"use client";

import { useState, useTransition } from "react";
import { FieldError } from "@/components/ui/field-error";
import { submitWritingAction } from "../actions";
import { countWords } from "../domain/word-count";
import {
  MAX_WRITING_CHARS,
  MIN_WRITING_CHARS,
  WRITING_TYPE_LABELS,
  type WritingType,
} from "../domain/writing-entry";

/**
 * Choose a kind of writing, then write it.
 *
 * Two steps in one screen rather than two routes: picking free writing or a
 * retelling is a decision measured in a second, and a page transition around it
 * would be the slowest part of the flow.
 *
 * The word count shown while typing is the same function the server stores, so
 * the number does not change when the text is submitted — and so a learner
 * writing Japanese is not told they have written one word.
 */
export function WritingComposer({
  languageName,
  languageCode,
}: {
  languageName: string;
  languageCode: string;
}) {
  const [type, setType] = useState<WritingType | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await submitWritingAction({ type, text });
      // A success redirects, so anything that comes back is a problem.
      if (!result.ok) setError(result.error);
    });
  };

  if (type === null) {
    return <ModePicker languageName={languageName} onChoose={setType} />;
  }

  const trimmed = text.trim();
  const tooShort = trimmed.length < MIN_WRITING_CHARS;

  return (
    <div className="flex flex-col pt-3">
      <header>
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.03em]">
          {WRITING_TYPE_LABELS[type]}
        </h1>
        <p className="mt-2 text-[0.9375rem] leading-[1.5] text-muted">
          {type === "retelling"
            ? `Retell it in ${languageName}, in your own words.`
            : `Write in ${languageName}. Anything you like.`}
        </p>
      </header>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value.slice(0, MAX_WRITING_CHARS))}
        // Autofocus is right here: the whole screen exists to be typed into.
        autoFocus
        rows={12}
        aria-label={`Your ${WRITING_TYPE_LABELS[type].toLowerCase()}`}
        placeholder={
          type === "retelling"
            ? "What happened, and what did you think of it?"
            : "Start anywhere. A few sentences is enough."
        }
        className="mt-6 min-h-[14rem] w-full resize-y rounded-[var(--radius-card)] bg-surface p-4 text-[1rem] leading-[1.6] text-fg placeholder:text-faint"
      />

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <p className="text-[0.8125rem] text-faint">
          {trimmed === "" ? "" : `${countWords(trimmed, languageCode)} words`}
        </p>
        <button
          type="button"
          onClick={() => setType(null)}
          className="text-[0.8125rem] font-medium text-muted transition-colors active:text-fg"
        >
          Change type
        </button>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={pending || tooShort}
        className="mt-6 h-14 w-full rounded-[var(--radius-control)] bg-accent text-[0.9375rem] font-bold text-accent-ink transition-colors active:bg-accent-pressed disabled:opacity-50"
      >
        {pending ? "Reviewing…" : "Review my writing"}
      </button>

      {pending ? (
        <p className="mt-3 text-center text-[0.8125rem] leading-snug text-faint">
          Saving your writing and reading it. This takes a few seconds.
        </p>
      ) : null}

      <FieldError message={error} />
    </div>
  );
}

function ModePicker({
  languageName,
  onChoose,
}: {
  languageName: string;
  onChoose: (type: WritingType) => void;
}) {
  return (
    <div className="flex flex-col pt-3">
      <header>
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.03em]">Writing</h1>
        <p className="mt-2.5 max-w-[24rem] text-[0.9375rem] leading-[1.5] text-muted">
          Write something in {languageName} and get it back with the mistakes marked, explained
          and corrected.
        </p>
      </header>

      <div className="mt-8 flex flex-col gap-2">
        <ModeRow
          type="free_writing"
          description="Write about anything at all."
          onChoose={onChoose}
        />
        <ModeRow
          type="retelling"
          description="Retell something you watched, read or listened to."
          onChoose={onChoose}
        />
      </div>
    </div>
  );
}

function ModeRow({
  type,
  description,
  onChoose,
}: {
  type: WritingType;
  description: string;
  onChoose: (type: WritingType) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChoose(type)}
      className="rounded-[var(--radius-card)] bg-surface px-4 py-4 text-left transition-colors active:bg-surface-raised"
    >
      <span className="block text-[1.0625rem] font-semibold tracking-[-0.01em]">
        {WRITING_TYPE_LABELS[type]}
      </span>
      <span className="mt-1 block text-[0.875rem] leading-snug text-muted">{description}</span>
    </button>
  );
}
