import { readAiConfig, type AiConfig } from "./config";

/**
 * The only place in the codebase that speaks HTTP to an AI provider.
 *
 * A small typed `fetch` wrapper rather than a framework: we make one kind of
 * call — a non-streaming chat completion that must come back as JSON matching a
 * schema — and a general-purpose AI abstraction would be more code than the
 * thing it abstracts. Feature code never builds a request itself; it asks for a
 * structured completion and gets back either parsed JSON or a reason.
 *
 * Built against OpenRouter's stable chat-completions endpoint:
 * https://openrouter.ai/api/v1/chat/completions
 *
 * Nothing here logs the API key, the prompt or the response body.
 *
 * Server-only, in the same way `lib/telegram/init-data.ts` is: the key is read
 * from an environment variable with no `NEXT_PUBLIC_` prefix, so Next.js never
 * inlines it into a client bundle, and only server actions and the data layer
 * import this module.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Every way a completion can fail, reduced to something a caller can act on and
 * a learner can be told about without seeing a provider stack trace.
 */
export type AiFailureReason =
  /** OPENROUTER_API_KEY or OPENROUTER_MODEL is not set. An operator problem. */
  | "not_configured"
  | "timeout"
  | "network"
  | "rate_limited"
  /** The key was rejected, or the account is out of credit. */
  | "auth"
  | "credits"
  /** The model or its providers are down, or none met the routing requirements. */
  | "provider_unavailable"
  /** No provider for this model supports the JSON-schema parameter we require. */
  | "unsupported_structured_output"
  /** A 200 that did not contain usable JSON. */
  | "invalid_response"
  | "bad_request";

export type AiUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

/**
 * How long the provider took, measured around the HTTP call itself.
 *
 * Reported on failures as well as successes, because "the timeout fired after
 * 45 seconds" and "it refused in 200ms" are different operational problems and
 * a log that only timed the happy path could not tell them apart.
 */
export type StructuredCompletion =
  | {
      ok: true;
      /** Parsed JSON. Still unvalidated — the caller owns the shape. */
      data: unknown;
      /** The model that actually answered, as reported by the provider. */
      model: string;
      usage: AiUsage;
      /** Wall-clock milliseconds spent waiting on the provider. */
      durationMs: number;
    }
  | { ok: false; reason: AiFailureReason; durationMs: number };

export type StructuredRequest = {
  /** Trusted instructions. Never contains learner input. */
  system: string;
  /** The turn carrying untrusted content, already delimited by the caller. */
  user: string;
  /** Identifies the schema to the provider; a-z and underscores. */
  schemaName: string;
  /** A JSON Schema object. Sent with `strict: true`. */
  schema: Record<string, unknown>;
};

export async function requestStructuredCompletion(
  request: StructuredRequest,
): Promise<StructuredCompletion> {
  const configured = readAiConfig();
  if (!configured.ok) {
    // Logged for whoever runs the deployment. The learner sees none of this.
    console.error("[ai] not configured; missing:", configured.missing.join(", "));
    // Nothing was waited on, so there is nothing to time.
    return { ok: false, reason: "not_configured", durationMs: 0 };
  }

  return send(configured.config, request);
}

async function send(config: AiConfig, request: StructuredRequest): Promise<StructuredCompletion> {
  let response: Response;
  /**
   * `performance.now()` rather than `Date.now()`: this is a duration, and a
   * clock that can step backwards over an NTP correction would occasionally
   * report a negative one.
   */
  const startedAt = performance.now();
  const elapsed = () => Math.round(performance.now() - startedAt);

  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: buildHeaders(config),
      body: JSON.stringify(buildBody(config, request)),
      // A hung provider must not hold a serverless function open to its limit.
      signal: AbortSignal.timeout(config.timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    return { ok: false, reason: isTimeout(error) ? "timeout" : "network", durationMs: elapsed() };
  }

  if (!response.ok) {
    const reason = classifyHttpFailure(response.status, await readErrorMessage(response));
    // Status and our own classification only — never the provider's body, which
    // can echo the prompt back.
    console.error(`[ai] provider returned ${response.status} (${reason}) after ${elapsed()}ms`);
    return { ok: false, reason, durationMs: elapsed() };
  }

  let payload: OpenRouterResponse;
  try {
    payload = (await response.json()) as OpenRouterResponse;
  } catch {
    return { ok: false, reason: "invalid_response", durationMs: elapsed() };
  }

  /**
   * A 200 can still carry an error object: OpenRouter reports some failures in
   * the body rather than the status line.
   */
  if (payload?.error) {
    const reason = classifyHttpFailure(payload.error.code ?? 0, payload.error.message ?? "");
    console.error("[ai] provider reported an error inside a 200 response:", reason);
    return { ok: false, reason, durationMs: elapsed() };
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    return { ok: false, reason: "invalid_response", durationMs: elapsed() };
  }

  const data = parseJson(content);
  if (data === undefined) {
    // The model answered, but not with JSON. Schema-following is best-effort at
    // some providers, so this is an expected failure, not an exception.
    return { ok: false, reason: "invalid_response", durationMs: elapsed() };
  }

  return {
    ok: true,
    data,
    model: typeof payload.model === "string" ? payload.model : config.model,
    usage: readUsage(payload.usage),
    durationMs: elapsed(),
  };
}

function buildHeaders(config: AiConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
    // OpenRouter's attribution headers. Optional, and neither carries a secret.
    "X-Title": "Language OS",
  };
  if (config.appUrl) headers["HTTP-Referer"] = config.appUrl;
  return headers;
}

function buildBody(config: AiConfig, request: StructuredRequest) {
  return {
    model: config.model,
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: request.schemaName,
        strict: true,
        schema: request.schema,
      },
    },
    /**
     * Without this, OpenRouter may route to a provider that does not implement
     * `response_format` and silently drops it — which arrives as prose where
     * JSON should be. Requiring the parameter turns that into an honest 404 we
     * can report, at the cost of a smaller provider pool.
     *
     * It also constrains what else may be sent. `require_parameters` means
     * *every* parameter in the request must be supported, and a sampling
     * setting is exactly the kind that many endpoints do not advertise — asking
     * for one alongside a schema is how you end up with no eligible providers
     * at all. So the request carries the schema and nothing optional: the
     * guarantee is worth more than a temperature.
     */
    provider: { require_parameters: true },
  };
}

/** OpenRouter reuses HTTP status codes; the message disambiguates a few of them. */
export function classifyHttpFailure(status: number, message: string): AiFailureReason {
  const lowered = message.toLowerCase();

  if (
    lowered.includes("response_format") ||
    lowered.includes("json_schema") ||
    lowered.includes("structured output")
  ) {
    return "unsupported_structured_output";
  }

  switch (status) {
    case 400:
    case 422:
      return "bad_request";
    case 401:
    case 403:
      return "auth";
    case 402:
      return "credits";
    case 404:
      // "No endpoints found matching your data policy / parameters."
      return lowered.includes("no endpoints")
        ? "unsupported_structured_output"
        : "bad_request";
    case 408:
    case 524:
      return "timeout";
    case 413:
      return "bad_request";
    case 429:
      return "rate_limited";
    case 502:
    case 503:
    case 529:
      return "provider_unavailable";
    default:
      return status >= 500 ? "provider_unavailable" : "bad_request";
  }
}

/**
 * The provider's own words, read only to tell two failures apart and never
 * shown to anyone. Capped so a huge body cannot be dragged into a log line.
 */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as OpenRouterResponse;
    return (body?.error?.message ?? "").slice(0, 300);
  } catch {
    return "";
  }
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function readUsage(usage: OpenRouterUsage | undefined): AiUsage {
  return {
    inputTokens: wholeNumber(usage?.prompt_tokens),
    outputTokens: wholeNumber(usage?.completion_tokens),
  };
}

function wholeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function isTimeout(error: unknown): boolean {
  // AbortSignal.timeout() rejects with a DOMException named TimeoutError.
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

type OpenRouterUsage = {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  total_tokens?: unknown;
};

type OpenRouterResponse = {
  model?: unknown;
  choices?: { message?: { content?: unknown } }[];
  usage?: OpenRouterUsage;
  error?: { code?: number; message?: string };
};
