import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyHttpFailure, requestStructuredCompletion } from "./openrouter";

/**
 * The provider client, against a stubbed `fetch`.
 *
 * No test in this file reaches the network: OpenRouter is a paid service, and a
 * test suite that spends money is a test suite people stop running.
 */

const REQUEST = {
  system: "You review writing.",
  user: "Review this.",
  schemaName: "writing_review",
  schema: { type: "object" } as Record<string, unknown>,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function completion(content: unknown, extra: Record<string, unknown> = {}) {
  return {
    model: "test/model-v1",
    choices: [{ message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 120, completion_tokens: 340, total_tokens: 460 },
    ...extra,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-key");
  vi.stubEnv("OPENROUTER_MODEL", "test/model");
  vi.stubEnv("TELEGRAM_WEBAPP_URL", "https://example.test");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a successful completion", () => {
  it("returns the parsed JSON, the answering model and the token usage", async () => {
    fetchMock.mockResolvedValue(jsonResponse(completion({ summary: "Good." })));

    const result = await requestStructuredCompletion(REQUEST);

    // `toMatchObject` rather than `toEqual`: the reply also carries how long
    // the provider took, which is a measurement and not part of the contract
    // this case is about. It has its own test below.
    expect(result).toMatchObject({
      ok: true,
      data: { summary: "Good." },
      model: "test/model-v1",
      usage: { inputTokens: 120, outputTokens: 340 },
    });
  });

  it("reports how long the provider took", async () => {
    fetchMock.mockResolvedValue(jsonResponse(completion({ summary: "Good." })));

    const result = await requestStructuredCompletion(REQUEST);

    /**
     * The number itself is the machine's business — what matters is that every
     * reply carries one, because the practice screens are tuned against these
     * timings and a phase that quietly stopped reporting would be invisible.
     */
    expect(result.durationMs).toBeTypeOf("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("reports absent usage as absent rather than as zero", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ model: "m", choices: [{ message: { content: "{}" } }] }),
    );

    const result = await requestStructuredCompletion(REQUEST);
    expect(result).toMatchObject({ ok: true, usage: { inputTokens: null, outputTokens: null } });
  });
});

describe("the request that is actually sent", () => {
  it("goes to the stable chat-completions endpoint with the configured model", async () => {
    fetchMock.mockResolvedValue(jsonResponse(completion({})));
    await requestStructuredCompletion(REQUEST);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("test/model");
    expect(body.messages).toEqual([
      { role: "system", content: REQUEST.system },
      { role: "user", content: REQUEST.user },
    ]);
  });

  it("asks for a strict JSON schema", async () => {
    fetchMock.mockResolvedValue(jsonResponse(completion({})));
    await requestStructuredCompletion(REQUEST);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "writing_review", strict: true, schema: REQUEST.schema },
    });
  });

  it("refuses providers that would silently drop the schema parameter", async () => {
    fetchMock.mockResolvedValue(jsonResponse(completion({})));
    await requestStructuredCompletion(REQUEST);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.provider).toEqual({ require_parameters: true });
  });

  it("sends nothing optional alongside the schema", async () => {
    /**
     * `require_parameters` requires every parameter to be supported, and
     * sampling settings are widely unadvertised — sending one leaves no
     * eligible provider and the whole feature answers 404. Adding a parameter
     * here is a decision to check against the model's endpoints first.
     */
    fetchMock.mockResolvedValue(jsonResponse(completion({})));
    await requestStructuredCompletion(REQUEST);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(Object.keys(body).sort()).toEqual([
      "messages",
      "model",
      "provider",
      "response_format",
    ]);
  });

  it("carries the key in the Authorization header and nowhere else", async () => {
    fetchMock.mockResolvedValue(jsonResponse(completion({})));
    await requestStructuredCompletion(REQUEST);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer sk-or-test-key");
    expect(init.headers["X-Title"]).toBe("Language OS");
    expect(init.headers["HTTP-Referer"]).toBe("https://example.test");
    expect(init.body).not.toContain("sk-or-test-key");
  });

  it("gives up rather than hanging a request open forever", async () => {
    fetchMock.mockResolvedValue(jsonResponse(completion({})));
    await requestStructuredCompletion(REQUEST);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("configuration", () => {
  it("does not call the provider at all when the key is missing", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const result = await requestStructuredCompletion(REQUEST);

    expect(result).toMatchObject({ ok: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fall back to some other model when none is configured", async () => {
    vi.stubEnv("OPENROUTER_MODEL", "");
    const result = await requestStructuredCompletion(REQUEST);

    expect(result).toMatchObject({ ok: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("failures", () => {
  it("reports a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await requestStructuredCompletion(REQUEST)).toMatchObject({
      ok: false,
      reason: "network",
    });
  });

  it("reports a timeout", async () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    fetchMock.mockRejectedValue(timeout);

    expect(await requestStructuredCompletion(REQUEST)).toMatchObject({
      ok: false,
      reason: "timeout",
    });
  });

  it("reports rate limiting separately from everything else", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 429, message: "slow down" } }, 429));
    expect(await requestStructuredCompletion(REQUEST)).toMatchObject({
      ok: false,
      reason: "rate_limited",
    });
  });

  it("reports a model with no provider that supports structured output", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: 404, message: "No endpoints found matching your parameters" } },
        404,
      ),
    );

    expect(await requestStructuredCompletion(REQUEST)).toMatchObject({
      ok: false,
      reason: "unsupported_structured_output",
    });
  });

  it("reports an error the provider put inside a 200 response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 502, message: "model is down" } }));
    expect(await requestStructuredCompletion(REQUEST)).toMatchObject({
      ok: false,
      reason: "provider_unavailable",
    });
  });

  it("reports prose where JSON was promised", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ model: "m", choices: [{ message: { content: "Sure! Here you go:" } }] }),
    );

    expect(await requestStructuredCompletion(REQUEST)).toMatchObject({
      ok: false,
      reason: "invalid_response",
    });
  });

  it("reports an empty or shapeless answer", async () => {
    for (const body of [
      { model: "m", choices: [] },
      { model: "m", choices: [{ message: { content: "" } }] },
      { model: "m" },
    ]) {
      fetchMock.mockResolvedValue(jsonResponse(body));
      expect(await requestStructuredCompletion(REQUEST)).toMatchObject({
        ok: false,
        reason: "invalid_response",
      });
    }
  });

  it("reports a body that is not JSON at all", async () => {
    fetchMock.mockResolvedValue(new Response("<html>502 Bad Gateway</html>", { status: 200 }));
    expect(await requestStructuredCompletion(REQUEST)).toMatchObject({
      ok: false,
      reason: "invalid_response",
    });
  });

  it("never puts the key or the provider's words into a log line", async () => {
    const logged = vi.mocked(console.error);
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 401, message: "Bad key sk-or-test-key" } }, 401),
    );

    await requestStructuredCompletion(REQUEST);

    const output = logged.mock.calls.flat().join(" ");
    expect(output).not.toContain("sk-or-test-key");
    expect(output).not.toContain("Bad key");
    expect(output).toContain("401");
  });
});

describe("classifying a status code", () => {
  it("maps each one to something a caller can act on", () => {
    expect(classifyHttpFailure(401, "")).toBe("auth");
    expect(classifyHttpFailure(403, "")).toBe("auth");
    expect(classifyHttpFailure(402, "")).toBe("credits");
    expect(classifyHttpFailure(408, "")).toBe("timeout");
    expect(classifyHttpFailure(413, "")).toBe("bad_request");
    expect(classifyHttpFailure(429, "")).toBe("rate_limited");
    expect(classifyHttpFailure(500, "")).toBe("provider_unavailable");
    expect(classifyHttpFailure(503, "")).toBe("provider_unavailable");
  });

  it("recognises a structured-output complaint whatever the status", () => {
    expect(classifyHttpFailure(400, "response_format is not supported")).toBe(
      "unsupported_structured_output",
    );
    expect(classifyHttpFailure(422, "invalid json_schema")).toBe(
      "unsupported_structured_output",
    );
  });
});
