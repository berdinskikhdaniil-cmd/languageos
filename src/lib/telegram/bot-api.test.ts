import { describe, expect, it, vi } from "vitest";
import { TelegramBotApiError, createTelegramBotApi } from "./bot-api";

const TOKEN = "123456:FAKE-test-token";

function apiReturning(payload: unknown, status = 200) {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(payload), { status }));
  return { api: createTelegramBotApi(TOKEN, { fetchImpl: fetchImpl as unknown as typeof fetch }), fetchImpl };
}

describe("createTelegramBotApi", () => {
  it("reads the fields it needs out of getMe", async () => {
    const { api, fetchImpl } = apiReturning({
      ok: true,
      result: { id: 42, is_bot: true, username: "LanguageOsBot", first_name: "Language OS" },
    });

    await expect(api.getMe()).resolves.toEqual({
      id: 42,
      username: "LanguageOsBot",
      firstName: "Language OS",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("posts sendMessage in Telegram's own field names", async () => {
    const { api, fetchImpl } = apiReturning({ ok: true, result: { message_id: 7 } });

    await api.sendMessage({
      chatId: 555,
      text: "hello",
      replyMarkup: { inline_keyboard: [[{ text: "Open", web_app: { url: "https://app.example.com" } }]] },
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(JSON.parse(init.body as string)).toEqual({
      chat_id: 555,
      text: "hello",
      reply_markup: { inline_keyboard: [[{ text: "Open", web_app: { url: "https://app.example.com" } }]] },
    });
  });

  it("passes the secret token to setWebhook without echoing it back", async () => {
    const { api, fetchImpl } = apiReturning({ ok: true, result: true });

    await api.setWebhook({
      url: "https://app.example.com/api/telegram/webhook",
      secretToken: "s3cret",
      allowedUpdates: ["message"],
    });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      url: "https://app.example.com/api/telegram/webhook",
      secret_token: "s3cret",
      allowed_updates: ["message"],
    });
  });

  it("turns a Bot API error into a named error carrying the code", async () => {
    const { api } = apiReturning({ ok: false, error_code: 401, description: "Unauthorized" }, 401);

    const error = await api.getMe().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TelegramBotApiError);
    expect((error as TelegramBotApiError).kind).toBe("api");
    expect((error as TelegramBotApiError).errorCode).toBe(401);
    expect((error as TelegramBotApiError).message).toContain("Unauthorized");
  });

  it("rejects a response that is not a Bot API envelope", async () => {
    const { api } = apiReturning({ result: { id: 1 } });

    const error = await api.getMe().catch((e: unknown) => e);
    expect((error as TelegramBotApiError).kind).toBe("malformed_response");
  });

  it("rejects a result missing a field it would otherwise read as undefined", async () => {
    const { api } = apiReturning({ ok: true, result: { username: "LanguageOsBot" } });

    const error = await api.getMe().catch((e: unknown) => e);
    expect((error as TelegramBotApiError).kind).toBe("malformed_response");
    expect((error as TelegramBotApiError).message).toContain("id");
  });

  it("reports a non-JSON body as an HTTP failure rather than crashing", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>502</html>", { status: 502 }));
    const api = createTelegramBotApi(TOKEN, { fetchImpl: fetchImpl as unknown as typeof fetch });

    const error = await api.getMe().catch((e: unknown) => e);
    expect((error as TelegramBotApiError).kind).toBe("http");
    expect((error as TelegramBotApiError).message).toContain("502");
  });

  it("reports a network failure by name only", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const api = createTelegramBotApi(TOKEN, { fetchImpl: fetchImpl as unknown as typeof fetch });

    const error = await api.getMe().catch((e: unknown) => e);
    expect((error as TelegramBotApiError).kind).toBe("network");
  });

  it("reports a timeout as its own kind", async () => {
    const fetchImpl = vi.fn(async () => {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    });
    const api = createTelegramBotApi(TOKEN, { fetchImpl: fetchImpl as unknown as typeof fetch });

    const error = await api.getMe().catch((e: unknown) => e);
    expect((error as TelegramBotApiError).kind).toBe("timeout");
  });

  it("aborts the request rather than waiting forever", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ ok: true, result: { id: 1, first_name: "x" } }));
    });

    await createTelegramBotApi(TOKEN, { fetchImpl: fetchImpl as unknown as typeof fetch }).getMe();
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("never lets the token reach an error message, however Telegram phrases it", async () => {
    const { api } = apiReturning({
      ok: false,
      error_code: 404,
      description: `Not Found: https://api.telegram.org/bot${TOKEN}/getMe`,
    });

    const error = (await api.getMe().catch((e: unknown) => e)) as TelegramBotApiError;

    expect(error).toBeInstanceOf(TelegramBotApiError);
    expect(error.message).not.toContain(TOKEN);
    expect(error.message).toContain("<redacted>");
  });
});
