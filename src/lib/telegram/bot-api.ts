/**
 * A small server-only client for the Telegram Bot API.
 *
 * Deliberately not an SDK: it covers the handful of methods this app calls and
 * nothing else. Every call goes through one request path so timeouts, error
 * translation and token redaction are decided once.
 *
 * Two rules hold everywhere below:
 *   - the bot token never leaves this module — not in a message, not in a log,
 *     not inside an error thrown by `fetch`;
 *   - a malformed response is an error with a name, not a surprise `undefined`
 *     somewhere downstream.
 */

import { telegramBotToken } from "@/lib/auth/config";

const TELEGRAM_API_ORIGIN = "https://api.telegram.org";
const DEFAULT_TIMEOUT_MS = 10_000;

export type TelegramErrorKind =
  | "configuration"
  | "network"
  | "timeout"
  | "http"
  | "api"
  | "malformed_response";

/** The only error this module throws. Safe to log as-is. */
export class TelegramBotApiError extends Error {
  readonly kind: TelegramErrorKind;
  readonly method: string;
  readonly errorCode: number | null;

  constructor(kind: TelegramErrorKind, method: string, detail: string, errorCode: number | null = null) {
    super(`Telegram ${method} failed (${kind}): ${detail}`);
    this.name = "TelegramBotApiError";
    this.kind = kind;
    this.method = method;
    this.errorCode = errorCode;
  }
}

export type TelegramBotUser = {
  id: number;
  username: string | null;
  firstName: string;
};

export type TelegramInlineKeyboardButton = { text: string; web_app: { url: string } };

export type TelegramInlineKeyboard = { inline_keyboard: TelegramInlineKeyboardButton[][] };

export type SendMessageParams = {
  chatId: number;
  text: string;
  replyMarkup?: TelegramInlineKeyboard;
};

export type TelegramBotCommand = { command: string; description: string };

export type TelegramMenuButton =
  | { type: "web_app"; text: string; web_app: { url: string } }
  | { type: "commands" }
  | { type: "default" };

export type SetWebhookParams = {
  url: string;
  secretToken: string;
  /** Which update types to receive. Narrow by default — this bot reads messages. */
  allowedUpdates?: string[];
  dropPendingUpdates?: boolean;
};

export type TelegramWebhookInfo = {
  url: string;
  pendingUpdateCount: number;
  lastErrorMessage: string | null;
  lastErrorDate: number | null;
};

export type TelegramBotApi = {
  getMe(): Promise<TelegramBotUser>;
  sendMessage(params: SendMessageParams): Promise<{ messageId: number }>;
  setMyCommands(commands: TelegramBotCommand[]): Promise<void>;
  setChatMenuButton(menuButton: TelegramMenuButton): Promise<void>;
  setWebhook(params: SetWebhookParams): Promise<void>;
  getWebhookInfo(): Promise<TelegramWebhookInfo>;
  deleteWebhook(options?: { dropPendingUpdates?: boolean }): Promise<void>;
};

export type TelegramBotApiOptions = {
  /** Injected in tests. Never reaches the network there. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** Last line of defence: a token must not survive into any string we surface. */
function redact(text: string, token: string): string {
  return token ? text.split(token).join("<redacted>") : text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`expected a string at "${field}"`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`expected a number at "${field}"`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export function createTelegramBotApi(
  token: string,
  options: TelegramBotApiOptions = {},
): TelegramBotApi {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function call<T>(
    method: string,
    body: Record<string, unknown>,
    parse: (result: unknown) => T,
  ): Promise<T> {
    // Built here and nowhere else, so the token has no chance to travel.
    const url = `${TELEGRAM_API_ORIGIN}/bot${token}/${method}`;

    let response: Response;
    try {
      response = await doFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "Error";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new TelegramBotApiError("timeout", method, `no response within ${timeoutMs}ms`);
      }
      throw new TelegramBotApiError("network", method, redact(name, token));
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      // A non-JSON body is only ever an infrastructure answer (a proxy, a 502).
      throw new TelegramBotApiError("http", method, `HTTP ${response.status} with a non-JSON body`);
    }

    if (!isRecord(payload) || typeof payload.ok !== "boolean") {
      throw new TelegramBotApiError("malformed_response", method, "response was not a Bot API envelope");
    }

    if (!payload.ok) {
      const description = optionalString(payload.description) ?? "no description";
      const errorCode = typeof payload.error_code === "number" ? payload.error_code : null;
      throw new TelegramBotApiError("api", method, redact(description, token), errorCode);
    }

    try {
      return parse(payload.result);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unreadable result";
      throw new TelegramBotApiError("malformed_response", method, redact(detail, token));
    }
  }

  /** Methods whose result carries nothing we need beyond "it worked". */
  const ignoreResult = () => undefined;

  return {
    getMe: () =>
      call("getMe", {}, (result) => {
        if (!isRecord(result)) throw new Error("expected a user object");
        return {
          id: requireNumber(result.id, "id"),
          username: optionalString(result.username),
          firstName: requireString(result.first_name, "first_name"),
        };
      }),

    sendMessage: ({ chatId, text, replyMarkup }) =>
      call(
        "sendMessage",
        { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) },
        (result) => {
          if (!isRecord(result)) throw new Error("expected a message object");
          return { messageId: requireNumber(result.message_id, "message_id") };
        },
      ),

    setMyCommands: (commands) => call("setMyCommands", { commands }, ignoreResult),

    setChatMenuButton: (menuButton) => call("setChatMenuButton", { menu_button: menuButton }, ignoreResult),

    setWebhook: ({ url, secretToken, allowedUpdates, dropPendingUpdates }) =>
      call(
        "setWebhook",
        {
          url,
          secret_token: secretToken,
          ...(allowedUpdates ? { allowed_updates: allowedUpdates } : {}),
          ...(dropPendingUpdates === undefined ? {} : { drop_pending_updates: dropPendingUpdates }),
        },
        ignoreResult,
      ),

    getWebhookInfo: () =>
      call("getWebhookInfo", {}, (result) => {
        if (!isRecord(result)) throw new Error("expected a webhook info object");
        return {
          url: requireString(result.url, "url"),
          pendingUpdateCount: requireNumber(result.pending_update_count, "pending_update_count"),
          lastErrorMessage: optionalString(result.last_error_message),
          lastErrorDate: typeof result.last_error_date === "number" ? result.last_error_date : null,
        };
      }),

    deleteWebhook: (deleteOptions = {}) =>
      call(
        "deleteWebhook",
        deleteOptions.dropPendingUpdates === undefined
          ? {}
          : { drop_pending_updates: deleteOptions.dropPendingUpdates },
        ignoreResult,
      ),
  };
}

/**
 * The client for the configured bot. Throws a named configuration error rather
 * than making a request that could only fail.
 */
export function telegramBotApiFromEnv(options: TelegramBotApiOptions = {}): TelegramBotApi {
  const token = telegramBotToken();
  if (!token) {
    throw new TelegramBotApiError("configuration", "any", "TELEGRAM_BOT_TOKEN is not set");
  }
  return createTelegramBotApi(token, options);
}
