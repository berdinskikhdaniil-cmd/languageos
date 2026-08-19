/**
 * The AI provider's settings, read from the environment at call time.
 *
 * Server-only. Neither value may ever carry a `NEXT_PUBLIC_` prefix: the key is
 * a spending credential, and a public copy would let anyone bill this account.
 *
 * There is deliberately no default model. A silent fallback would mean a
 * self-hoster who mistyped `OPENROUTER_MODEL` quietly pays for a model they did
 * not choose, and it would make "which model reviewed this?" unanswerable.
 * Missing configuration is reported, never guessed around.
 */

const DEFAULT_TIMEOUT_MS = 45_000;

/**
 * Transcription gets its own, shorter budget. OpenRouter's upstream providers
 * give up after 60 seconds, and the whole upload-and-transcribe request has to
 * finish inside one serverless invocation — so waiting longer than the provider
 * will ever answer only burns the function's own limit.
 */
const DEFAULT_STT_TIMEOUT_MS = 50_000;

export type AiConfig = {
  apiKey: string;
  /** An OpenRouter model slug, e.g. "anthropic/claude-sonnet-4". */
  model: string;
  timeoutMs: number;
  /** Sent as HTTP-Referer for OpenRouter's attribution. Optional. */
  appUrl: string | null;
};

export type AiConfigResult =
  | { ok: true; config: AiConfig }
  /** Which variables are missing, for an operator-facing log — never for a learner. */
  | { ok: false; missing: string[] };

export function readAiConfig(): AiConfigResult {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const model = process.env.OPENROUTER_MODEL?.trim();

  const missing: string[] = [];
  if (!apiKey) missing.push("OPENROUTER_API_KEY");
  if (!model) missing.push("OPENROUTER_MODEL");
  if (!apiKey || !model) return { ok: false, missing };

  return {
    ok: true,
    config: {
      apiKey,
      model,
      timeoutMs: positiveInteger(process.env.OPENROUTER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
      appUrl: process.env.TELEGRAM_WEBAPP_URL?.trim() || null,
    },
  };
}

/** Whether the product can offer AI at all. Cheap enough to call per render. */
export function isAiConfigured(): boolean {
  return readAiConfig().ok;
}

export type SttConfig = {
  apiKey: string;
  /** An OpenRouter transcription slug, e.g. "openai/whisper-large-v3". */
  model: string;
  timeoutMs: number;
  appUrl: string | null;
};

export type SttConfigResult =
  | { ok: true; config: SttConfig }
  | { ok: false; missing: string[] };

/**
 * Speech-to-text settings, read separately from the chat model.
 *
 * They share the API key and nothing else: transcription is a different
 * endpoint with a different model roster, and an installation may reasonably
 * have one and not the other. Keeping them apart means a deployment with no
 * `OPENROUTER_STT_MODEL` loses Speaking and keeps Writing, rather than both
 * features failing because one variable is absent.
 *
 * No default model, for the same reason `readAiConfig` has none: a silent
 * fallback spends somebody's money on a model they did not choose.
 */
export function readSttConfig(): SttConfigResult {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const model = process.env.OPENROUTER_STT_MODEL?.trim();

  const missing: string[] = [];
  if (!apiKey) missing.push("OPENROUTER_API_KEY");
  if (!model) missing.push("OPENROUTER_STT_MODEL");
  if (!apiKey || !model) return { ok: false, missing };

  return {
    ok: true,
    config: {
      apiKey,
      model,
      timeoutMs: positiveInteger(process.env.OPENROUTER_STT_TIMEOUT_MS, DEFAULT_STT_TIMEOUT_MS),
      appUrl: process.env.TELEGRAM_WEBAPP_URL?.trim() || null,
    },
  };
}

/**
 * Whether Speaking can work at all. Both halves are needed: the recording is
 * transcribed by the STT model and the transcript is then reviewed by the chat
 * model, so a deployment missing either cannot finish the loop.
 */
export function isSpeakingConfigured(): boolean {
  return readSttConfig().ok && readAiConfig().ok;
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
