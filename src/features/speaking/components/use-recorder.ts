"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppErrorCode } from "@/lib/errors";
import {
  AUDIO_BITS_PER_SECOND,
  MAX_SPEAKING_SECONDS,
  chooseRecordingMimeType,
} from "../domain/recording";

/**
 * The microphone, wrapped so one component can use it without knowing anything
 * about `MediaRecorder`.
 *
 * Every browser this runs in records something different — Chromium gives
 * WebM/Opus, Safari and therefore Telegram on iOS give MP4/AAC, Firefox gives
 * Ogg — so the format is chosen at runtime from what the browser admits to
 * supporting, never assumed. The choice itself is a pure function in
 * domain/recording.ts; this hook only supplies the one browser API call it
 * needs.
 *
 * Two things it is careful about. The microphone track is stopped on every exit
 * path, because a live track leaves the recording indicator on and the
 * microphone held — on a phone that is alarming and on iOS it stays that way
 * until the tab is closed. And the recording stops itself at the cap rather
 * than trusting anyone to notice, because a recording past the limit is one
 * that cannot be uploaded at all.
 *
 * Duration is wall-clock, measured here. A `MediaRecorder` blob frequently
 * carries no duration header at all, so asking the file how long it is would
 * return `Infinity` on the most common platform we have.
 */

export type RecorderState = "idle" | "requesting" | "recording" | "recorded";

export type Recording = {
  /**
   * This take's own identity, minted once when it is produced.
   *
   * It travels with the upload as the idempotency key: a double tap on Send
   * carries the same value, so the server finds the first request's attempt
   * instead of starting a second transcription. Generated here, in the event
   * handler that creates the recording, because that is the one moment a new
   * take exists — deriving it during render would mint a fresh one on any
   * re-render and defeat the whole point.
   */
  id: string;
  blob: Blob;
  /** The exact type the recorder produced, with its codec parameters. */
  mimeType: string;
  seconds: number;
};

export type Recorder = {
  state: RecorderState;
  /** Milliseconds recorded so far. Drives the timer and the countdown. */
  elapsedMs: number;
  recording: Recording | null;
  error: AppErrorCode | null;
  start: () => void;
  stop: () => void;
  /** Throws the take away and returns to the topic. */
  reset: () => void;
};

/** How often the timer redraws. A tenth of a second is smooth without churn. */
const TICK_MS = 100;

export function useRecorder(): Recorder {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<AppErrorCode | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  /** Releases the microphone. Safe to call twice; called on every exit path. */
  const releaseMicrophone = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  // Leaving the screen mid-recording must not leave the microphone open.
  useEffect(() => releaseMicrophone, [releaseMicrophone]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    // `onstop` does the rest: it is the only place that sees the final chunk.
    recorder.stop();
  }, []);

  const start = useCallback(() => {
    setError(null);
    setRecording(null);
    setElapsedMs(0);

    if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
      setError("MIC_UNSUPPORTED");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      // Also what an insecure origin looks like: the API is simply absent.
      setError("MIC_UNSUPPORTED");
      return;
    }

    const format = chooseRecordingMimeType((type) => {
      try {
        return MediaRecorder.isTypeSupported(type);
      } catch {
        return false;
      }
    });

    if (!format) {
      setError("RECORDING_FORMAT_UNSUPPORTED");
      return;
    }
    setState("requesting");

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (stream.getAudioTracks().length === 0) {
          stream.getTracks().forEach((track) => track.stop());
          setError("MIC_FAILED");
          setState("idle");
          return;
        }

        streamRef.current = stream;
        chunksRef.current = [];

        let recorder: MediaRecorder;
        try {
          recorder = new MediaRecorder(stream, {
            mimeType: format.mimeType,
            audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
          });
        } catch {
          // Some platforms accept a type in `isTypeSupported` and refuse it in
          // the constructor. Their own default is better than no recording.
          try {
            recorder = new MediaRecorder(stream);
          } catch {
            releaseMicrophone();
            setError("MIC_FAILED");
            setState("idle");
            return;
          }
        }

        recorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
        };

        recorder.onerror = () => {
          releaseMicrophone();
          setError("MIC_FAILED");
          setState("idle");
        };

        recorder.onstop = () => {
          const seconds = (Date.now() - startedAtRef.current) / 1000;
          releaseMicrophone();

          /**
           * The recorder's own reported type wins over the one we asked for:
           * where the constructor fell back to a default, this is the only
           * place that knows what it actually produced.
           */
          const mimeType = recorder.mimeType || format.mimeType;
          const blob = new Blob(chunksRef.current, { type: mimeType });
          chunksRef.current = [];

          if (blob.size === 0) {
            setError("RECORDING_EMPTY");
            setState("idle");
            return;
          }

          setRecording({ id: crypto.randomUUID(), blob, mimeType, seconds });
          setState("recorded");
        };

        startedAtRef.current = Date.now();
        // A timeslice keeps chunks arriving, so a tab suspended mid-recording
        // still yields everything up to that moment rather than nothing.
        recorder.start(1000);
        setState("recording");

        tickRef.current = window.setInterval(() => {
          const ms = Date.now() - startedAtRef.current;
          setElapsedMs(ms);
          // Stops itself at the cap. A recording past it cannot be uploaded,
          // so letting it run would only waste somebody's breath.
          if (ms >= MAX_SPEAKING_SECONDS * 1000) stop();
        }, TICK_MS);
      })
      .catch((cause: unknown) => {
        releaseMicrophone();
        setState("idle");
        setError(isPermissionDenied(cause) ? "MIC_DENIED" : "MIC_FAILED");
      });
  }, [releaseMicrophone, stop]);

  const reset = useCallback(() => {
    releaseMicrophone();
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(null);
    setElapsedMs(0);
    setError(null);
    setState("idle");
  }, [releaseMicrophone]);

  return { state, elapsedMs, recording, error, start, stop, reset };
}

/**
 * Telling "you said no" apart from "it broke".
 *
 * They need different words: one is a setting the learner can change, the other
 * is not their doing at all. The name is the reliable signal; the message is
 * not, and is never shown.
 */
function isPermissionDenied(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null || !("name" in cause)) return false;
  const name = (cause as { name?: unknown }).name;
  return name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError";
}
