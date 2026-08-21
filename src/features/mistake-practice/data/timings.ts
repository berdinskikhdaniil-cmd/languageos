import type { AiUsage } from "@/lib/ai/openrouter";

/**
 * Where the seconds go, written down so it can be argued about with numbers.
 *
 * A learner reported that building a set felt like the app had frozen. The
 * honest first move was not to guess which half was slow — it was to measure
 * both, in production, on real work. This is that measurement.
 *
 * Everything here is operational and nothing here is content. No exercise, no
 * answer, no fragment of anybody's writing, no prompt and no response body: a
 * log is the one place where a learner's sentences would sit in plain text
 * forever, and the whole point of the mistake practice prompts is to keep them
 * out of places they do not belong. What is recorded is a session id, a model
 * slug, some durations and some token counts — enough to tell a slow provider
 * from a slow parser, and nothing that would embarrass anyone if it leaked.
 *
 * Lengths and counts are not content, which is why the number of grounding
 * examples is safe to record and the examples themselves are not.
 */

export type PracticePhase = "generation" | "grading";

export type PhaseTiming = {
  sessionId: string;
  /** What actually answered, as the provider reported it. */
  model: string;
  /** Wall-clock milliseconds spent waiting on the provider. */
  providerMs: number;
  /** Validating the response against the contract. Usually a rounding error. */
  parseMs: number;
  /** Everything the runner did, including the claim and the writes. */
  totalMs: number;
  usage: AiUsage;
  /** How many of the learner's own mistakes grounded the request. A count. */
  examples?: number;
  /** Present when the phase did not produce a usable result. */
  failure?: string;
};

/**
 * One line per phase, greppable and parseable.
 *
 * Deliberately `console.log` rather than a logging library: Vercel collects
 * stdout, this is the only place in the product that emits an operational
 * metric, and a dependency whose whole job is to add a severity prefix would be
 * more code than the thing it wraps.
 */
export function logPhaseTiming(phase: PracticePhase, timing: PhaseTiming): void {
  const parts = [
    `session=${timing.sessionId}`,
    `model=${timing.model}`,
    `provider_ms=${timing.providerMs}`,
    `parse_ms=${timing.parseMs}`,
    `total_ms=${timing.totalMs}`,
    `in_tokens=${timing.usage.inputTokens ?? "?"}`,
    `out_tokens=${timing.usage.outputTokens ?? "?"}`,
  ];

  if (timing.examples !== undefined) parts.push(`examples=${timing.examples}`);
  if (timing.failure) parts.push(`failure=${timing.failure}`);

  console.log(`[mistake-practice:${phase}] ${parts.join(" ")}`);
}

/** A monotonic stopwatch. `Date.now()` can step backwards; a duration cannot. */
export function stopwatch(): () => number {
  const startedAt = performance.now();
  return () => Math.round(performance.now() - startedAt);
}
