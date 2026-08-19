import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestTranscription } from "./transcription";

/**
 * The transcription client, against a stubbed `fetch`.
 *
 * No test in this file reaches the network. The shapes it asserts came from a
 * real call to the endpoint on 2026-08-19, recorded here so the contract can be
 * held without spending anything to check it.
 */

const AUDIO = new Uint8Array([1, 2, 3, 4]).buffer;

const REQUEST = {
  audio: AUDIO,
  fileName: "speaking.webm",
  contentType: "audio/webm",
  languageCode: "en",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;
let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-key");
  vi.stubEnv("OPENROUTER_STT_MODEL", "openai/whisper-large-v3");
  vi.stubEnv("TELEGRAM_WEBAPP_URL", "https://example.test");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a successful transcription", () => {
  it("returns the text, the answering model and the usage the provider reported", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        text: " Yesterday I go to the shop.",
        model: "openai/whisper-large-v3",
        usage: { seconds: 3.618, cost: 0.000027135 },
      }),
    );

    const result = await requestTranscription(REQUEST);

    expect(result).toEqual({
      ok: true,
      // Whisper prefixes a space; an untrimmed one would shift every offset
      // the review later resolves against this text.
      text: "Yesterday I go to the shop.",
      model: "openai/whisper-large-v3",
      usage: { seconds: 3.618, costUsd: 0.000027135, inputTokens: null, outputTokens: null },
    });
  });

  it("copes with a usage object that reports no tokens at all", async () => {
    // A duration-priced model reports seconds and cost and nothing else.
    fetchMock.mockResolvedValue(jsonResponse({ text: "Hello.", usage: { seconds: 2 } }));

    const result = await requestTranscription(REQUEST);
    expect(result).toMatchObject({
      ok: true,
      usage: { seconds: 2, costUsd: null, inputTokens: null, outputTokens: null },
    });
  });

  it("copes with no usage object at all", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: "Hello." }));

    const result = await requestTranscription(REQUEST);
    expect(result).toMatchObject({
      ok: true,
      usage: { seconds: null, costUsd: null },
    });
  });

  it("sends the audio as multipart, with the model and the language", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: "Hello." }));

    await requestTranscription(REQUEST);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/audio/transcriptions");
    expect(init.method).toBe("POST");

    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("model")).toBe("openai/whisper-large-v3");
    expect(body.get("language")).toBe("en");

    const file = body.get("file") as File;
    // The filename is how the endpoint identifies the format.
    expect(file.name).toBe("speaking.webm");
    expect(file.type).toBe("audio/webm");
  });

  it("never sets Content-Type itself, so fetch can add the multipart boundary", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: "Hello." }));

    await requestTranscription(REQUEST);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;

    expect(headers["Authorization"]).toBe("Bearer sk-or-test-key");
    expect(Object.keys(headers)).not.toContain("Content-Type");
  });
});

describe("a recording with nothing in it", () => {
  it("is its own outcome, not a fault", async () => {
    // Somebody tapped record and said nothing. Telling them the service broke
    // would send them to try again in exactly the same way.
    fetchMock.mockResolvedValue(jsonResponse({ text: "   " }));

    expect(await requestTranscription(REQUEST)).toEqual({ ok: false, reason: "empty_transcript" });
  });

  it("covers an entirely absent text field as a broken response instead", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ usage: { seconds: 1 } }));
    expect(await requestTranscription(REQUEST)).toEqual({ ok: false, reason: "invalid_response" });
  });
});

describe("a provider that refuses", () => {
  it("classifies the statuses that matter", async () => {
    const cases: [number, string, string][] = [
      [400, "Model does not exist", "bad_request"],
      [401, "User not found.", "auth"],
      [402, "Insufficient credits", "credits"],
      [408, "timed out", "timeout"],
      [429, "Rate limit exceeded", "rate_limited"],
      [500, "internal", "provider_unavailable"],
      [503, "upstream down", "provider_unavailable"],
    ];

    for (const [status, message, reason] of cases) {
      fetchMock.mockResolvedValue(jsonResponse({ error: { message, code: status } }, status));
      expect(await requestTranscription(REQUEST), `${status}`).toEqual({ ok: false, reason });
    }
  });

  it("reads an error reported inside a 200, as OpenRouter sometimes does", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: "Rate limit exceeded", code: 429 } }),
    );

    expect(await requestTranscription(REQUEST)).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("treats a body that is not JSON as a broken response", async () => {
    fetchMock.mockResolvedValue(new Response("<html>gateway</html>", { status: 200 }));
    expect(await requestTranscription(REQUEST)).toEqual({ ok: false, reason: "invalid_response" });
  });
});

describe("a call that does not come back", () => {
  it("reports a timeout when the request is aborted", async () => {
    const timeout = new Error("The operation timed out");
    timeout.name = "TimeoutError";
    fetchMock.mockRejectedValue(timeout);

    expect(await requestTranscription(REQUEST)).toEqual({ ok: false, reason: "timeout" });
  });

  it("reports a network failure otherwise", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await requestTranscription(REQUEST)).toEqual({ ok: false, reason: "network" });
  });

  it("asks fetch to give up rather than holding the function open", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: "Hello." }));
    await requestTranscription(REQUEST);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("configuration", () => {
  it("refuses to call anything when the STT model is not set", async () => {
    vi.stubEnv("OPENROUTER_STT_MODEL", "");

    expect(await requestTranscription(REQUEST)).toEqual({ ok: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses when the API key is not set", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");

    expect(await requestTranscription(REQUEST)).toEqual({ ok: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("what reaches the log", () => {
  it("never carries the key, the audio or the transcript", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: "sk-or-test-key leaked here", code: 500 } }, 500),
    );
    await requestTranscription(REQUEST);

    fetchMock.mockResolvedValue(jsonResponse({ text: "A private thing I said out loud." }));
    await requestTranscription(REQUEST);

    const logged = errorLog.mock.calls.flat().join(" ");
    expect(logged).not.toContain("sk-or-test-key");
    expect(logged).not.toContain("A private thing I said out loud");
    // The status and our own classification are what a log is for.
    expect(logged).toContain("500");
  });
});
