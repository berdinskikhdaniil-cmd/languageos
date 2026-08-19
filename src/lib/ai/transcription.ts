import { readSttConfig, type SttConfig } from "./config";
import { classifyHttpFailure, type AiFailureReason } from "./openrouter";

/**
 * Turning a recording into text, and the only place that speaks HTTP to a
 * speech-to-text provider.
 *
 * A second small client rather than a generalisation of the chat one: this is a
 * different endpoint, with a different request shape (multipart, not JSON), a
 * different response (`{ text, usage }`, not `choices`), and a different model
 * roster. Merging them would produce a function of flags.
 *
 * Built against OpenRouter's audio endpoint, verified against a live call on
 * 2026-08-19:
 *   POST https://openrouter.ai/api/v1/audio/transcriptions
 *   multipart/form-data: `file` (the audio) and `model` (the slug)
 *   200 → { "text": "…", "usage": { "seconds": 3.6, "cost": 0.000027 } }
 *   4xx/5xx → { "error": { "message": "…", "code": 400 } }
 * The usage object is sparse — a duration-priced model reports `seconds` and
 * `cost` and no tokens at all — so every field in it is read as optional.
 *
 * The audio is sent as multipart rather than base64 JSON on purpose: base64
 * inflates the payload by a third for no benefit, and the endpoint's 25 MB
 * multipart cap is far above anything a 90-second recording produces.
 *
 * Nothing here logs the API key, the audio, or the transcript. A transcript is
 * a recording of somebody's voice in text form and is treated as their content,
 * not as diagnostics.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/audio/transcriptions";

export type TranscriptionFailureReason =
  | AiFailureReason
  /** The provider answered, but with nothing in it — silence, or no speech. */
  | "empty_transcript";

export type TranscriptionUsage = {
  /** Audio seconds as the provider measured them. Our own duration record. */
  seconds: number | null;
  /** US dollars, when the provider reports it. Null is normal. */
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type TranscriptionResult =
  | { ok: true; text: string; model: string; usage: TranscriptionUsage }
  | { ok: false; reason: TranscriptionFailureReason };

export type TranscriptionRequest = {
  /** The recording's bytes, exactly as they arrived. Never logged, never stored. */
  audio: ArrayBuffer;
  /** Sent as the upload's filename, which is how the endpoint reads the format. */
  fileName: string;
  /** The audio's MIME type, exactly as the browser recorded it. */
  contentType: string;
  /** Hints the spoken language, as an ISO 639-1 code. Optional but cheap. */
  languageCode?: string;
};

export async function requestTranscription(
  request: TranscriptionRequest,
): Promise<TranscriptionResult> {
  const configured = readSttConfig();
  if (!configured.ok) {
    // Logged for whoever runs the deployment. The learner sees none of this.
    console.error("[stt] not configured; missing:", configured.missing.join(", "));
    return { ok: false, reason: "not_configured" };
  }

  return send(configured.config, request);
}

async function send(
  config: SttConfig,
  request: TranscriptionRequest,
): Promise<TranscriptionResult> {
  const form = new FormData();
  form.append("file", new Blob([request.audio], { type: request.contentType }), request.fileName);
  form.append("model", config.model);
  if (request.languageCode) form.append("language", request.languageCode);

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      // No Content-Type: fetch sets it, with the multipart boundary.
      headers: buildHeaders(config),
      body: form,
      // A hung provider must not hold a serverless function open to its limit.
      signal: AbortSignal.timeout(config.timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    return { ok: false, reason: isTimeout(error) ? "timeout" : "network" };
  }

  if (!response.ok) {
    const reason = classifyHttpFailure(response.status, await readErrorMessage(response));
    // Status and our own classification only — never the provider's body.
    console.error(`[stt] provider returned ${response.status} (${reason})`);
    return { ok: false, reason };
  }

  let payload: TranscriptionResponse;
  try {
    payload = (await response.json()) as TranscriptionResponse;
  } catch {
    return { ok: false, reason: "invalid_response" };
  }

  // OpenRouter reports some failures inside a 200, as it does for completions.
  if (payload?.error) {
    const reason = classifyHttpFailure(payload.error.code ?? 0, payload.error.message ?? "");
    console.error("[stt] provider reported an error inside a 200 response:", reason);
    return { ok: false, reason };
  }

  if (typeof payload?.text !== "string") return { ok: false, reason: "invalid_response" };

  /**
   * Whisper prefixes its output with a space, so the transcript is trimmed
   * before anything measures or stores it — an untrimmed leading space would
   * shift every character offset the review later resolves against this text.
   */
  const text = payload.text.trim();

  /**
   * An empty transcript is a real outcome, not a fault: somebody tapped record
   * and said nothing, or the microphone captured only room noise. It gets its
   * own reason so the learner is told to try speaking rather than told the
   * service is broken.
   */
  if (text === "") return { ok: false, reason: "empty_transcript" };

  return {
    ok: true,
    text,
    model: typeof payload.model === "string" ? payload.model : config.model,
    usage: readUsage(payload.usage),
  };
}

function buildHeaders(config: SttConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    "X-Title": "Language OS",
  };
  if (config.appUrl) headers["HTTP-Referer"] = config.appUrl;
  return headers;
}

/** The provider's own words, read only to tell two failures apart. Never shown. */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as TranscriptionResponse;
    return (body?.error?.message ?? "").slice(0, 300);
  } catch {
    return "";
  }
}

function readUsage(usage: TranscriptionUsageBody | undefined): TranscriptionUsage {
  return {
    seconds: positiveNumber(usage?.seconds),
    costUsd: positiveNumber(usage?.cost),
    inputTokens: wholeNumber(usage?.input_tokens),
    outputTokens: wholeNumber(usage?.output_tokens),
  };
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function wholeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

type TranscriptionUsageBody = {
  seconds?: unknown;
  cost?: unknown;
  input_tokens?: unknown;
  output_tokens?: unknown;
  total_tokens?: unknown;
};

type TranscriptionResponse = {
  text?: unknown;
  model?: unknown;
  usage?: TranscriptionUsageBody;
  error?: { code?: number; message?: string };
};
