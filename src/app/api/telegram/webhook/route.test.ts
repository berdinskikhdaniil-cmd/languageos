import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TELEGRAM_SECRET_HEADER } from "@/lib/telegram/bot-config";
import { handleTelegramUpdate } from "@/lib/telegram/bot-handler";
import { POST } from "./route";

// The route's job is authentication and parsing; what the bot says is the
// handler's, and the Bot API is never reached from a test.
vi.mock("@/lib/telegram/bot-handler", () => ({
  handleTelegramUpdate: vi.fn(async () => ({ action: "start" })),
}));

vi.mock("@/lib/telegram/bot-api", () => ({
  telegramBotApiFromEnv: vi.fn(() => ({ sendMessage: vi.fn() })),
}));

const SECRET = "webhook-secret-value";

const UPDATE = {
  update_id: 51,
  message: {
    message_id: 1,
    chat: { id: 555, type: "private" },
    from: { id: 99, is_bot: false, first_name: "Lena" },
    text: "/start",
  },
};

function webhookRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("https://app.example.com/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

beforeEach(() => {
  vi.mocked(handleTelegramUpdate).mockClear();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("TELEGRAM_WEBAPP_URL", "https://app.example.com");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/telegram/webhook — the secret gate", () => {
  it("rejects a request with no secret header", async () => {
    const response = await POST(webhookRequest(JSON.stringify(UPDATE)));

    expect(response.status).toBe(401);
    expect(handleTelegramUpdate).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const response = await POST(
      webhookRequest(JSON.stringify(UPDATE), { [TELEGRAM_SECRET_HEADER]: "not-the-secret" }),
    );

    expect(response.status).toBe(401);
    expect(handleTelegramUpdate).not.toHaveBeenCalled();
  });

  it("rejects a secret that is merely a prefix of the real one", async () => {
    const response = await POST(
      webhookRequest(JSON.stringify(UPDATE), { [TELEGRAM_SECRET_HEADER]: SECRET.slice(0, -1) }),
    );

    expect(response.status).toBe(401);
    expect(handleTelegramUpdate).not.toHaveBeenCalled();
  });

  it("refuses to serve at all when no secret is configured", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", undefined);

    const response = await POST(
      webhookRequest(JSON.stringify(UPDATE), { [TELEGRAM_SECRET_HEADER]: SECRET }),
    );

    expect(response.status).toBe(503);
    expect(handleTelegramUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /api/telegram/webhook — the body", () => {
  const authorised = { [TELEGRAM_SECRET_HEADER]: SECRET };

  it("rejects malformed JSON without a stack trace", async () => {
    const response = await POST(webhookRequest("{not json", authorised));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Malformed request." });
    expect(handleTelegramUpdate).not.toHaveBeenCalled();
  });

  it("acknowledges a payload it cannot recognise instead of asking for a retry", async () => {
    const response = await POST(webhookRequest(JSON.stringify({ nonsense: true }), authorised));

    expect(response.status).toBe(200);
    expect(handleTelegramUpdate).not.toHaveBeenCalled();
  });

  it("passes a valid, authenticated update to the handler", async () => {
    const response = await POST(webhookRequest(JSON.stringify(UPDATE), authorised));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(handleTelegramUpdate).toHaveBeenCalledTimes(1);

    const [update, context] = vi.mocked(handleTelegramUpdate).mock.calls[0];
    expect(update.updateId).toBe(51);
    expect(update.message?.text).toBe("/start");
    expect(context.webAppUrl).toBe("https://app.example.com");
  });

  it("gives the handler no Mini App URL when only a local one is configured", async () => {
    vi.stubEnv("TELEGRAM_WEBAPP_URL", "http://localhost:3000");

    await POST(webhookRequest(JSON.stringify(UPDATE), authorised));

    expect(vi.mocked(handleTelegramUpdate).mock.calls[0][1].webAppUrl).toBeNull();
  });

  it("still acknowledges when the handler fails, so Telegram does not redeliver", async () => {
    vi.mocked(handleTelegramUpdate).mockRejectedValueOnce(new Error("Telegram sendMessage failed"));

    const response = await POST(webhookRequest(JSON.stringify(UPDATE), authorised));

    expect(response.status).toBe(200);
  });
});
