"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FieldError } from "@/components/ui/field-error";
import { formatElapsed } from "@/lib/format";
import type { AppErrorCode } from "@/lib/errors";
import { useMessages } from "@/lib/i18n/locale-context";
import type { Messages } from "@/lib/i18n/messages";
import { reviewSpeakingAttemptAction } from "../actions";
import {
  MAX_SPEAKING_SECONDS,
  MIN_SPEAKING_SECONDS,
  checkRecording,
} from "../domain/recording";
import { pickTopic, type SpeakingTopic } from "../domain/topics";
import { useRecorder } from "./use-recorder";

/**
 * Topic, record, send. One screen, four states.
 *
 * Not four routes: the whole exercise is one continuous act, and a page
 * transition between "you stopped talking" and "here is your recording" would
 * be the slowest thing in it. The result *is* a route — it has to be, because
 * it persists and can be reopened — so this screen hands over to it at the end
 * and never tries to render the feedback itself.
 *
 * The recording is never sent automatically. Stopping and sending are two
 * decisions, and somebody who trailed off mid-sentence should get to hear it
 * and start again before spending a transcription on it.
 */

type Phase = "ready" | "uploading" | "reviewing";

export function SpeakingPractice({
  languageCode,
  initialTopic,
}: {
  languageCode: string;
  /** Chosen on the server, so the first render is not a coin toss. */
  initialTopic: SpeakingTopic;
}) {
  const router = useRouter();
  const messages = useMessages();
  const recorder = useRecorder();

  const [topic, setTopic] = useState(initialTopic);
  const [phase, setPhase] = useState<Phase>("ready");
  const [failure, setFailure] = useState<AppErrorCode | null>(null);

  const busy = phase !== "ready";

  const send = async () => {
    const recording = recorder.recording;
    if (!recording || busy) return;

    // The same check the server runs. Catching it here saves an upload that
    // was always going to be refused.
    const checked = checkRecording({
      seconds: recording.seconds,
      bytes: recording.blob.size,
      mimeType: recording.mimeType,
    });
    if (!checked.ok) {
      setFailure(checked.code);
      return;
    }

    setFailure(null);
    setPhase("uploading");

    const body = new FormData();
    body.append("audio", recording.blob, "answer");
    /**
     * The take's own id, minted once when it was recorded. Sending twice sends
     * the same value, which is what makes a double tap a lookup rather than a
     * second transcription.
     */
    body.append("clientRequestId", recording.id);
    body.append("topicKey", topic.key);
    body.append("durationSeconds", String(checked.seconds));

    let attemptId: string;
    try {
      const response = await fetch("/api/speaking/attempts", { method: "POST", body });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; attemptId?: string; code?: AppErrorCode }
        | null;

      if (!response.ok || !payload?.ok || !payload.attemptId) {
        setFailure(payload?.code ?? "SPEAKING_UPLOAD_FAILED");
        setPhase("ready");
        return;
      }
      attemptId = payload.attemptId;
    } catch {
      setFailure("SPEAKING_UPLOAD_FAILED");
      setPhase("ready");
      return;
    }

    /**
     * The transcript exists (or its failure is recorded) either way. Reviewing
     * it is a second call, which keeps both requests short and means a review
     * that fails can be retried from the result screen without re-recording.
     * Its outcome is not checked here: the result screen reads the truth from
     * the database and says whatever is actually the case.
     */
    setPhase("reviewing");
    await reviewSpeakingAttemptAction(attemptId);
    router.push(`/practice/speaking/${attemptId}`);
  };

  if (busy) return <Processing phase={phase} messages={messages} />;

  if (recorder.state === "recording" || recorder.state === "requesting") {
    return (
      <RecordingInProgress
        messages={messages}
        topic={topic}
        elapsedMs={recorder.elapsedMs}
        requesting={recorder.state === "requesting"}
        onStop={recorder.stop}
      />
    );
  }

  if (recorder.state === "recorded" && recorder.recording) {
    return (
      <Recorded
        messages={messages}
        topic={topic}
        recording={recorder.recording}
        failure={failure}
        onRecordAgain={() => {
          setFailure(null);
          recorder.reset();
        }}
        onSend={() => void send()}
      />
    );
  }

  return (
    <div className="flex flex-col pt-3">
      <header>
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.03em]">
          {messages.speaking.title}
        </h1>
        <p className="mt-2.5 max-w-[24rem] text-[0.9375rem] leading-[1.5] text-muted">
          {messages.speaking.intro}
        </p>
      </header>

      <TopicCard messages={messages} topic={topic} />

      <button
        type="button"
        onClick={() => {
          setTopic(pickTopic(languageCode, { exclude: topic.key }) ?? topic);
          setFailure(null);
        }}
        className="mt-3 h-10 self-start text-[0.875rem] font-medium text-muted transition-colors active:text-fg"
      >
        {messages.speaking.anotherTopic}
      </button>

      <button
        type="button"
        onClick={recorder.start}
        className="mt-6 h-14 w-full rounded-[var(--radius-control)] bg-accent px-4 text-[0.9375rem] font-bold leading-tight text-accent-ink transition-colors active:bg-accent-pressed"
      >
        {messages.speaking.startRecording}
      </button>

      <p className="mt-3 text-[0.8125rem] leading-snug text-faint">{messages.speaking.micHint}</p>

      <FieldError message={recorder.error ? messages.errors[recorder.error] : null} />
      <FieldError message={failure ? messages.errors[failure] : null} />
    </div>
  );
}

function TopicCard({ messages, topic }: { messages: Messages; topic: SpeakingTopic }) {
  return (
    <section className="mt-7 rounded-[var(--radius-card)] bg-surface p-5">
      <h2 className="text-[0.8125rem] font-medium text-muted">{messages.speaking.topicHeading}</h2>
      {/*
        The topic is in the language being learned, whatever the interface is
        set to — it is the thing being answered, not a label around it.
      */}
      <p className="mt-2 text-[1.25rem] font-semibold leading-[1.4] tracking-[-0.02em]">
        {topic.prompt}
      </p>
    </section>
  );
}

function RecordingInProgress({
  messages,
  topic,
  elapsedMs,
  requesting,
  onStop,
}: {
  messages: Messages;
  topic: SpeakingTopic;
  elapsedMs: number;
  requesting: boolean;
  onStop: () => void;
}) {
  const seconds = Math.floor(elapsedMs / 1000);
  const left = Math.max(0, MAX_SPEAKING_SECONDS - seconds);

  return (
    <div className="flex flex-col pt-3">
      <TopicCard messages={messages} topic={topic} />

      <section className="mt-8">
        <p className="text-[0.8125rem] font-medium text-muted">
          {messages.speaking.recordingHeading}
        </p>
        {/*
          The counter is the recording indicator: it is running, it is green,
          and it is the largest thing on the screen. A pulsing dot beside it
          would say the same thing twice.
        */}
        <p className="mt-1.5 text-[3rem] font-bold leading-none tracking-[-0.04em] text-accent">
          {formatElapsed(seconds)}
        </p>
        <p className="mt-2.5 text-[0.875rem] text-muted">
          {messages.speaking.secondsLeft(left)}
        </p>
      </section>

      <button
        type="button"
        onClick={onStop}
        disabled={requesting}
        className="mt-8 h-14 w-full rounded-[var(--radius-control)] bg-surface-raised px-4 text-[0.9375rem] font-semibold leading-tight transition-colors active:bg-hairline disabled:opacity-60"
      >
        {messages.speaking.stop}
      </button>
    </div>
  );
}

function Recorded({
  messages,
  topic,
  recording,
  failure,
  onRecordAgain,
  onSend,
}: {
  messages: Messages;
  topic: SpeakingTopic;
  recording: { blob: Blob; seconds: number };
  failure: AppErrorCode | null;
  onRecordAgain: () => void;
  onSend: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /**
   * A local object URL, and the only way this recording is ever played.
   *
   * The effect points the audio element at it and revokes it on the way out —
   * the element is an external system being kept in step with React, which is
   * what an effect is for. Nothing about the URL belongs in state.
   *
   * It does not survive a reload, and that is honest: the audio is not kept
   * anywhere once it has been transcribed, so there is nothing to play back
   * later and the interface never suggests there is.
   */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const objectUrl = URL.createObjectURL(recording.blob);
    audio.src = objectUrl;

    return () => {
      audio.removeAttribute("src");
      URL.revokeObjectURL(objectUrl);
    };
  }, [recording.blob]);

  const seconds = Math.round(recording.seconds);
  const tooShort = seconds < MIN_SPEAKING_SECONDS;

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      audio.currentTime = 0;
      setPlaying(false);
      return;
    }
    void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  return (
    <div className="flex flex-col pt-3">
      <TopicCard messages={messages} topic={topic} />

      <section className="mt-8">
        <p className="text-[0.8125rem] font-medium text-muted">
          {messages.speaking.recordingHeading}
        </p>
        <p className="mt-1.5 text-[2.5rem] font-bold leading-none tracking-[-0.04em]">
          {formatElapsed(seconds)}
        </p>
      </section>

      <audio
        ref={audioRef}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        className="hidden"
      />

      <div className="mt-6 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={togglePlayback}
          className="h-12 rounded-[var(--radius-control)] bg-surface px-3 text-center text-[0.9375rem] font-semibold leading-tight transition-colors active:bg-surface-raised"
        >
          {playing ? messages.speaking.stopListening : messages.speaking.listen}
        </button>
        <button
          type="button"
          onClick={onRecordAgain}
          className="h-12 rounded-[var(--radius-control)] bg-surface px-3 text-center text-[0.9375rem] font-semibold leading-tight transition-colors active:bg-surface-raised"
        >
          {messages.speaking.recordAgain}
        </button>
      </div>

      <button
        type="button"
        onClick={onSend}
        disabled={tooShort}
        className="mt-3 h-14 w-full rounded-[var(--radius-control)] bg-accent px-4 text-[0.9375rem] font-bold leading-tight text-accent-ink transition-colors active:bg-accent-pressed disabled:opacity-50"
      >
        {messages.speaking.submit}
      </button>

      <FieldError
        message={
          tooShort
            ? messages.errors.RECORDING_TOO_SHORT
            : failure
              ? messages.errors[failure]
              : null
        }
      />
    </div>
  );
}

/**
 * The two waits, named separately.
 *
 * "Transcribing" and "reviewing" are different lengths and different failures,
 * and a single spinner labelled "processing" would leave somebody watching a
 * blank screen wondering which half was slow.
 */
function Processing({ phase, messages }: { phase: Phase; messages: Messages }) {
  return (
    <div className="flex min-h-[60vh] flex-col justify-center pt-3">
      <p className="text-[1.25rem] font-semibold leading-snug tracking-[-0.02em]">
        {phase === "uploading" ? messages.speaking.transcribing : messages.speaking.reviewing}
      </p>
      <p className="mt-2.5 max-w-[22rem] text-[0.9375rem] leading-[1.5] text-muted">
        {messages.speaking.processingNote}
      </p>
    </div>
  );
}
