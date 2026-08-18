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

function positiveInteger(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
