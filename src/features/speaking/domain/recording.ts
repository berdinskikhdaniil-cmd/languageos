import type { AppErrorCode } from "@/lib/errors";

/**
 * What a recording has to be before it costs anything, and what format it is in.
 *
 * Pure: no `MediaRecorder`, no `window`, no database. The browser half asks
 * which MIME types to try; the server half re-checks the same limits against
 * the bytes that actually arrived. Both sides run the functions below, which is
 * the point — a client that lies about a duration is measured again on arrival.
 */

/**
 * The cap, and the reason there is one.
 *
 * A Vercel function may receive at most 4.5 MB of request body, and there is no
 * upload flow that survives a 413 gracefully. Ninety seconds is also about as
 * long as anybody speaks in one unprepared answer, so the limit that protects
 * the platform is the same one the exercise wants.
 */
export const MAX_SPEAKING_SECONDS = 90;

/**
 * Below this there is nothing to review. A one-second clip cannot show whether
 * somebody can hold a sentence together, and telling them it can would be a lie
 * dressed as feedback.
 */
export const MIN_SPEAKING_SECONDS = 3;

/**
 * Well under Vercel's 4.5 MB body limit, with room for the multipart envelope.
 *
 * Ninety seconds of Opus at the bitrate the recorder asks for is around 360 KB,
 * so this is roughly a tenfold margin — it exists to refuse something
 * pathological, not to constrain normal use.
 */
export const MAX_AUDIO_BYTES = 4_000_000;

/** What the recorder asks the browser for. Speech does not need more. */
export const AUDIO_BITS_PER_SECOND = 32_000;

/**
 * Formats OpenRouter's transcription endpoint accepts, mapped from the MIME
 * types browsers actually produce.
 *
 * The extension matters: the endpoint reads the format from the uploaded
 * filename, so `audio/mp4` has to arrive as `.m4a` and not as `.mp4`.
 *
 * Verified against the endpoint on 2026-08-19 for `audio/webm` (Chromium's
 * Opus) and `audio/mp4` (what Safari and therefore Telegram on iOS produce).
 */
const FORMATS: Readonly<Record<string, { format: string; extension: string }>> = {
  "audio/webm": { format: "webm", extension: "webm" },
  "audio/ogg": { format: "ogg", extension: "ogg" },
  "audio/mp4": { format: "m4a", extension: "m4a" },
  "audio/x-m4a": { format: "m4a", extension: "m4a" },
  "audio/aac": { format: "aac", extension: "aac" },
  "audio/mpeg": { format: "mp3", extension: "mp3" },
  "audio/wav": { format: "wav", extension: "wav" },
  "audio/wave": { format: "wav", extension: "wav" },
  "audio/x-wav": { format: "wav", extension: "wav" },
  "audio/flac": { format: "flac", extension: "flac" },
};

/**
 * The MIME types worth offering `MediaRecorder`, best first.
 *
 * There is no single answer: Chromium records WebM/Opus, Safari — and so
 * Telegram on iOS, which is a WKWebView — records MP4/AAC, Firefox records Ogg.
 * The recorder asks `isTypeSupported` in this order and takes the first yes,
 * so no assumption about the platform is baked in anywhere.
 */
export const PREFERRED_MIME_TYPES: readonly string[] = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/wav",
];

/** `audio/webm;codecs=opus` → `audio/webm`. Parameters are not part of the type. */
export function baseMimeType(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
}

export type AudioFormat = { mimeType: string; format: string; extension: string };

/**
 * The format a blob should be uploaded as, or null when we cannot name it.
 *
 * Null is a refusal, not a fallback. Sending an unknown container under a
 * guessed extension would produce a provider error the learner cannot act on,
 * so an unrecognised type is reported before the upload rather than after it.
 */
export function resolveAudioFormat(mimeType: string): AudioFormat | null {
  const base = baseMimeType(mimeType);
  const known = FORMATS[base];
  if (!known) return null;

  return { mimeType: base, format: known.format, extension: known.extension };
}

/**
 * Picks a recording format from what this browser says it supports.
 *
 * Takes the predicate rather than reaching for `MediaRecorder` itself, so the
 * choice is testable in Node and so the caller owns the one browser API call.
 * An empty string is the browser's own default and is deliberately *not*
 * returned as a candidate: we need to know the type to name the upload, and a
 * default we cannot identify is worse than no recording.
 */
export function chooseRecordingMimeType(
  isTypeSupported: (mimeType: string) => boolean,
): AudioFormat | null {
  for (const candidate of PREFERRED_MIME_TYPES) {
    if (!isTypeSupported(candidate)) continue;

    const resolved = resolveAudioFormat(candidate);
    // Keep the parameters: `MediaRecorder` was asked for this exact string.
    if (resolved) return { ...resolved, mimeType: candidate };
  }

  return null;
}

export type RecordingCheck = { ok: true; seconds: number } | { ok: false; code: AppErrorCode };

/**
 * Whether a recording may be uploaded and transcribed.
 *
 * Run on the client before spending an upload, and again on the server against
 * the bytes that arrived — the client's own numbers are a convenience, never
 * the record. Seconds are rounded rather than floored so a recording of 89.6
 * seconds is not reported as 89 and then rejected for being 90.
 */
export function checkRecording({
  seconds,
  bytes,
  mimeType,
}: {
  seconds: number;
  bytes: number;
  mimeType: string;
}): RecordingCheck {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return { ok: false, code: "RECORDING_EMPTY" };
  }
  if (bytes <= 0) return { ok: false, code: "RECORDING_EMPTY" };

  const rounded = Math.round(seconds);
  if (rounded < MIN_SPEAKING_SECONDS) return { ok: false, code: "RECORDING_TOO_SHORT" };

  // A second of slack: the recorder stops itself at the cap, and the last
  // chunk's timestamp can land just past it.
  if (rounded > MAX_SPEAKING_SECONDS + 1) return { ok: false, code: "RECORDING_TOO_LONG" };

  if (bytes > MAX_AUDIO_BYTES) return { ok: false, code: "RECORDING_TOO_LARGE" };
  if (!resolveAudioFormat(mimeType)) return { ok: false, code: "RECORDING_FORMAT_UNSUPPORTED" };

  return { ok: true, seconds: Math.min(rounded, MAX_SPEAKING_SECONDS) };
}
