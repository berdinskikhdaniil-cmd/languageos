import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  initDataMaxAgeSeconds,
  isProduction,
  telegramBotToken,
} from "@/lib/auth/config";
import { createAuthSession } from "@/lib/auth/session";
import { findOrCreateTelegramUser } from "@/lib/auth/telegram-login";
import {
  INIT_DATA_FAILURE_MESSAGES,
  validateTelegramInitData,
} from "@/lib/telegram/init-data";

/**
 * Exchanges a Telegram launch payload for one of our sessions.
 *
 * The client posts the raw `initData` string once, at startup. If the signature
 * checks out we resolve or create the user, mint a session and set an HttpOnly
 * cookie. Every request after that is authenticated by the cookie alone — the
 * client never sends initData again, and never sends a user id at all.
 *
 * Nothing here logs the payload, the bot token or the session token.
 */

export const dynamic = "force-dynamic";

type Body = { initData?: unknown };

function authFailure(message: string, status = 401) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return authFailure("Malformed request.", 400);
  }

  const initData = body.initData;
  if (typeof initData !== "string" || initData.length === 0) {
    return authFailure("Telegram did not provide any sign-in data.", 400);
  }

  const result = validateTelegramInitData(
    initData,
    telegramBotToken(),
    new Date(),
    initDataMaxAgeSeconds(),
  );

  if (!result.ok) {
    // The reason is logged; the payload that produced it is not.
    console.warn("[auth] telegram sign-in rejected:", result.reason);

    const status = result.reason === "missing_bot_token" ? 503 : 401;
    return authFailure(INIT_DATA_FAILURE_MESSAGES[result.reason], status);
  }

  let session;
  let userId: string;
  try {
    const user = await findOrCreateTelegramUser(result.user);
    userId = user.id;
    session = await createAuthSession(user.id);
  } catch (error) {
    console.error("[auth] could not establish a session", error);
    return NextResponse.json(
      { ok: false, error: "Could not sign you in right now. Try again." },
      { status: 503 },
    );
  }

  console.info("[auth] telegram sign-in established for user", userId);

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: session.token,
    httpOnly: true,
    // The cookie is only ever read by this origin's own server rendering.
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    expires: session.expiresAt,
  });

  return response;
}
