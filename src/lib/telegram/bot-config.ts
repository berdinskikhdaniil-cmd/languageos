/**
 * Configuration for the bot transport layer.
 *
 * Read at call time, never frozen at module load, so tests can vary it and a
 * misconfigured deploy fails where the value is used rather than at import.
 *
 * The bot token itself is not re-read here: `telegramBotToken()` in
 * `@/lib/auth/config` stays the single source for it.
 */

import { isProduction } from "@/lib/auth/config";

/** Where this app receives updates. Appended to the Mini App origin. */
export const TELEGRAM_WEBHOOK_PATH = "/api/telegram/webhook";

/** The header Telegram sends when a webhook was registered with a secret. */
export const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";

/** Telegram's own rule for `secret_token`: 1–256 chars of A-Z a-z 0-9 _ - */
const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

export type WebAppUrlProblem =
  | "missing"
  | "malformed"
  | "unsupported_scheme"
  | "insecure"
  | "local_in_production"
  | "local";

/** Safe to show an operator running a setup script. Never echoes a secret. */
export const WEB_APP_URL_PROBLEMS: Record<WebAppUrlProblem, string> = {
  missing: "TELEGRAM_WEBAPP_URL is not set.",
  malformed: "TELEGRAM_WEBAPP_URL is not a valid absolute URL.",
  unsupported_scheme: "TELEGRAM_WEBAPP_URL must use http or https.",
  insecure: "TELEGRAM_WEBAPP_URL must use https outside of localhost.",
  local_in_production: "TELEGRAM_WEBAPP_URL points at localhost, which cannot be used in production.",
  local: "TELEGRAM_WEBAPP_URL points at localhost, which Telegram cannot reach.",
};

export type WebAppUrl = {
  /** Normalised, without a trailing slash beyond the origin. */
  url: string;
  isSecure: boolean;
  isLocal: boolean;
};

export type WebAppUrlResult = { ok: true; value: WebAppUrl } | { ok: false; problem: WebAppUrlProblem };

/**
 * The one place a Mini App URL is judged. Pure, so both the runtime and the
 * setup scripts apply exactly the same rules.
 *
 * `production` rejects a localhost URL outright; everywhere else localhost is
 * accepted but flagged, and `webAppUrlForTelegram()` below still refuses to
 * hand it to Telegram.
 */
export function parseWebAppUrl(raw: string | null | undefined, production: boolean): WebAppUrlResult {
  const trimmed = raw?.trim();
  if (!trimmed) return { ok: false, problem: "missing" };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, problem: "malformed" };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, problem: "unsupported_scheme" };
  }

  const isLocal = LOCAL_HOSTNAMES.has(parsed.hostname);
  const isSecure = parsed.protocol === "https:";

  // Plain http is only ever tolerable against the developer's own machine.
  if (!isSecure && !isLocal) return { ok: false, problem: "insecure" };
  if (isLocal && production) return { ok: false, problem: "local_in_production" };

  const normalised = parsed.pathname === "/" ? parsed.origin : `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
  return { ok: true, value: { url: normalised, isSecure, isLocal } };
}

export function telegramWebAppUrl(): WebAppUrlResult {
  return parseWebAppUrl(process.env.TELEGRAM_WEBAPP_URL, isProduction());
}

/**
 * The URL as Telegram may receive it — a Web App button or a menu button.
 * Telegram opens the URL from the user's device, so localhost is not a URL we
 * are allowed to send, whatever the environment.
 */
export function webAppUrlForTelegram(): { ok: true; url: string } | { ok: false; problem: WebAppUrlProblem } {
  const result = telegramWebAppUrl();
  if (!result.ok) return result;
  if (result.value.isLocal) return { ok: false, problem: "local" };
  return { ok: true, url: result.value.url };
}

/** Convenience for request handling: the URL, or nothing to attach a button to. */
export function configuredWebAppUrl(): string | null {
  const result = webAppUrlForTelegram();
  return result.ok ? result.url : null;
}

/** Server-only. Never exposed to a browser and never logged. */
export function telegramWebhookSecret(): string | null {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  return secret ? secret : null;
}

export function isValidWebhookSecret(secret: string): boolean {
  return WEBHOOK_SECRET_PATTERN.test(secret);
}

/** The webhook endpoint derived from the Mini App origin — one URL, not two. */
export function telegramWebhookUrl(): { ok: true; url: string } | { ok: false; problem: WebAppUrlProblem } {
  const result = webAppUrlForTelegram();
  if (!result.ok) return result;
  // Appended to the Mini App URL itself, so an app served under a sub-path
  // still points at its own endpoint.
  return { ok: true, url: `${result.url}${TELEGRAM_WEBHOOK_PATH}` };
}
