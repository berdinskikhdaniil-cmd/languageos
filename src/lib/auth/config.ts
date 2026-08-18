/**
 * Authentication settings, read from the environment at call time so tests can
 * vary them and so a value is never frozen at module load.
 */

const DEFAULT_INIT_DATA_MAX_AGE_SECONDS = 3600;
const DEFAULT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export const SESSION_COOKIE_NAME = "language_os_session";

function positiveInteger(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Server-only. Absent means Telegram sign-in is unavailable, which is reported
 * as an authentication failure rather than waved through.
 */
export function telegramBotToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token ? token : null;
}

/** How long a launch's initData stays acceptable. */
export function initDataMaxAgeSeconds(): number {
  return positiveInteger(
    process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
    DEFAULT_INIT_DATA_MAX_AGE_SECONDS,
  );
}

/** Lifetime of one of our own sessions, and of its cookie. */
export function authSessionTtlSeconds(): number {
  return positiveInteger(process.env.AUTH_SESSION_TTL_SECONDS, DEFAULT_SESSION_TTL_SECONDS);
}

/**
 * Whether requests without a session may run as the local development user.
 *
 * Two conditions, both required: the operator opted in *and* this is not a
 * production build. The `NODE_ENV` half is what makes the bypass impossible to
 * reach in production through misconfiguration alone — setting ALLOW_DEV_AUTH
 * on a production deploy does nothing.
 *
 * This is a separate mode, never a fallback: a failed Telegram sign-in does not
 * arrive here.
 */
export function isDevAuthAllowed(): boolean {
  if (isProduction()) return false;
  return process.env.ALLOW_DEV_AUTH === "true";
}
