"use client";

import { useState, useTransition } from "react";
import { FieldError } from "@/components/ui/field-error";
import type { AppErrorCode } from "@/lib/errors";
import { useMessages } from "@/lib/i18n/locale-context";
import type { Messages } from "@/lib/i18n/messages";
import { submitWritingAction } from "../actions";
import { countWords } from "../domain/word-count";
import { MAX_WRITING_CHARS, MIN_WRITING_CHARS, type WritingType } from "../domain/writing-entry";

/**
 * Choose a kind of writing, then write it.
 *
 * Two steps in one screen rather than two routes: picking free writing or a
 * retelling is a decision measured in a second, and a page transition around it
 * would be the slowest part of the flow.
 *
 * Two languages meet here. The interface is in whichever the learner reads; the
 * text box is for whichever they are learning, and `languageName` arrives from
 * the server already written in the first. The word count is counted with the
 * *learning* language's rules and worded with the *interface* language's, which
 * is why the two codes are kept apart rather than collapsed into one.
 */
export function WritingComposer({
  languageName,
  languageCode,
}: {
  /** The learning language, already named in the reader's own language. */
  languageName: string;
  /** ISO code of the learning language, for segmenting words correctly. */
  languageCode: string;
}) {
  const messages = useMessages();
  const [type, setType] = useState<WritingType | null>(null);
  const [text, setText] = useState("");
  const [failure, setFailure] = useState<AppErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setFailure(null);
    startTransition(async () => {
      const result = await submitWritingAction({ type, text });
      // A success redirects, so anything that comes back is a problem. Submit
      // never reports a review failure — that is shown on the entry it saved.
      if (!result.ok && "code" in result) setFailure(result.code);
    });
  };

  if (type === null) {
    return <ModePicker messages={messages} languageName={languageName} onChoose={setType} />;
  }

  const trimmed = text.trim();
  const tooShort = trimmed.length < MIN_WRITING_CHARS;
  const typeLabel = messages.writing.types[type];

  return (
    <div className="flex flex-col pt-3">
      <header>
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.03em]">{typeLabel}</h1>
        <p className="mt-2 text-[0.9375rem] leading-[1.5] text-muted">
          {type === "retelling"
            ? messages.writing.retellingPrompt(languageName)
            : messages.writing.freePrompt(languageName)}
        </p>
      </header>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value.slice(0, MAX_WRITING_CHARS))}
        // Autofocus is right here: the whole screen exists to be typed into.
        autoFocus
        rows={12}
        aria-label={messages.writing.yourTextField(typeLabel)}
        placeholder={
          type === "retelling"
            ? messages.writing.retellingPlaceholder
            : messages.writing.freePlaceholder
        }
        className="mt-6 min-h-[14rem] w-full resize-y rounded-[var(--radius-card)] bg-surface p-4 text-[1rem] leading-[1.6] text-fg placeholder:text-faint"
      />

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <p className="text-[0.8125rem] text-faint">
          {trimmed === "" ? "" : messages.writing.wordCount(countWords(trimmed, languageCode))}
        </p>
        <button
          type="button"
          onClick={() => setType(null)}
          className="shrink-0 text-[0.8125rem] font-medium text-muted transition-colors active:text-fg"
        >
          {messages.writing.changeType}
        </button>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={pending || tooShort}
        className="mt-6 h-14 w-full rounded-[var(--radius-control)] bg-accent px-4 text-[0.9375rem] font-bold leading-tight text-accent-ink transition-colors active:bg-accent-pressed disabled:opacity-50"
      >
        {pending ? messages.writing.reviewing : messages.writing.reviewMyWriting}
      </button>

      {pending ? (
        <p className="mt-3 text-center text-[0.8125rem] leading-snug text-faint">
          {messages.writing.reviewingNote}
        </p>
      ) : null}

      <FieldError message={failure ? messages.errors[failure] : null} />
    </div>
  );
}

function ModePicker({
  messages,
  languageName,
  onChoose,
}: {
  messages: Messages;
  languageName: string;
  onChoose: (type: WritingType) => void;
}) {
  return (
    <div className="flex flex-col pt-3">
      <header>
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.03em]">
          {messages.writing.composerTitle}
        </h1>
        <p className="mt-2.5 max-w-[24rem] text-[0.9375rem] leading-[1.5] text-muted">
          {messages.writing.composerIntro(languageName)}
        </p>
      </header>

      <div className="mt-8 flex flex-col gap-2">
        <ModeRow
          label={messages.writing.types.free_writing}
          description={messages.writing.modeFreeDescription}
          onChoose={() => onChoose("free_writing")}
        />
        <ModeRow
          label={messages.writing.types.retelling}
          description={messages.writing.modeRetellingDescription}
          onChoose={() => onChoose("retelling")}
        />
      </div>
    </div>
  );
}

function ModeRow({
  label,
  description,
  onChoose,
}: {
  label: string;
  description: string;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      className="rounded-[var(--radius-card)] bg-surface px-4 py-4 text-left transition-colors active:bg-surface-raised"
    >
      <span className="block text-[1.0625rem] font-semibold tracking-[-0.01em]">{label}</span>
      <span className="mt-1 block text-[0.875rem] leading-snug text-muted">{description}</span>
    </button>
  );
}
