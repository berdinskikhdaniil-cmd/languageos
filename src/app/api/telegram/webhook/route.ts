import { createHash, timingSafeEqual } from "node:crypto";
import { telegramBotApiFromEnv } from "@/lib/telegram/bot-api";
import {
  TELEGRAM_SECRET_HEADER,
  configuredWebAppUrl,
  telegramWebhookSecret,
} from "@/lib/telegram/bot-config";
import { handleTelegramUpdate } from "@/lib/telegram/bot-handler";
import { parseTelegramUpdate } from "@/lib/telegram/update";

/**
 * Where Telegram delivers updates.
 *
 * The endpoint is public, so the secret header is the whole gate: Telegram
 * echoes the `secret_token` given to `setWebhook`, and a request without it is
 * refused before its body is looked at. Nothing here authenticates a person —
 * an update carries a Telegram chat, not one of our users, and this route
 * never mints a session or touches the Mini App's sign-in.
 *
 * Command logic lives in `handleTelegramUpdate`; this file only authenticates,
 * parses and answers.
 */

export const dynamic = "force-dynamic";

/** Compares digests so the check does not leak the secret's length. */
function secretMatches(provided: string, expected: string): boolean {
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

export async function POST(request: Request): Promise<Response> {
  const expectedSecret = telegramWebhookSecret();
  if (!expectedSecret) {
    console.error("[telegram] webhook received a request but TELEGRAM_WEBHOOK_SECRET is not set");
    return json({ ok: false }, 503);
  }

  const providedSecret = request.headers.get(TELEGRAM_SECRET_HEADER);
  if (!providedSecret || !secretMatches(providedSecret, expectedSecret)) {
    // No detail: an unauthenticated caller learns nothing about the secret.
    return json({ ok: false }, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Malformed request." }, 400);
  }

  const update = parseTelegramUpdate(payload);
  if (!update) {
    // Acknowledged, not retried: a shape we do not model will not become
    // readable on a second delivery.
    console.warn("[telegram] ignoring an unrecognised update payload");
    return json({ ok: true, status: "unrecognised" }, 200);
  }

  try {
    const outcome = await handleTelegramUpdate(update, {
      api: telegramBotApiFromEnv(),
      webAppUrl: configuredWebAppUrl(),
    });

    if (outcome.configurationProblem) {
      console.error(
        "[telegram] replied without a Mini App button:",
        outcome.configurationProblem,
        "— set TELEGRAM_WEBAPP_URL to a public HTTPS URL",
      );
    }
  } catch (error) {
    // Telegram redelivers anything it does not get a 2xx for, which would
    // repeat whatever part of the reply did succeed. Log and acknowledge.
    console.error("[telegram] failed to handle update", update.updateId, error);
  }

  return json({ ok: true }, 200);
}
