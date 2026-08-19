"use server";

import { revalidatePath } from "next/cache";
import {
  OnboardingIncompleteError,
  getCurrentUser,
  requireOnboarded,
} from "@/lib/auth/current-user";
import type { AppErrorCode } from "@/lib/errors";
import { isActivityType } from "./domain/activity";
import { validateManualEntry } from "./domain/manual-entry";
import {
  TrackerError,
  cancelSession,
  createManualSession,
  startSession,
  stopSession,
} from "./data/sessions";

/**
 * Every tracker mutation. Each one reports a plain result rather than throwing
 * at the UI, so a failure can be shown calmly next to the control that caused
 * it — and so the interface never claims a timer is running when the insert
 * did not land.
 *
 * A result carries a code, never a sentence. The server knows what went wrong;
 * only the screen knows which language the person reading it asked for.
 */

export type ActionResult = { ok: true } | { ok: false; code: AppErrorCode; field?: string };

/**
 * Resolves the caller, or throws so the surrounding handler reports a failure.
 * Every mutation below runs against this user's own id — none of them accepts an
 * id, a session id or a language id from the client.
 */
class SignedOutError extends Error {}

/**
 * Two distinct refusals, never one.
 *
 * A signed-out caller has no account; an authenticated caller who has not
 * finished onboarding has an account but no language to file time against.
 * Neither is allowed to reach the data layer, and neither is quietly given a
 * language — a session with no language is exactly the state the schema and
 * the onboarding transaction exist to prevent.
 */
async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new SignedOutError();
  return requireOnboarded(user);
}

/**
 * A TrackerError knows which rule was broken and says so in its code. Anything
 * else is a real fault (database down, bad connection string) and gets the
 * action's own generic code plus a server-side log.
 */
function toResult(error: unknown, fallback: AppErrorCode): ActionResult {
  if (error instanceof SignedOutError) {
    return { ok: false, code: "AUTH_EXPIRED" };
  }
  if (error instanceof OnboardingIncompleteError) {
    return { ok: false, code: "ONBOARDING_REQUIRED" };
  }
  if (error instanceof TrackerError) {
    return { ok: false, code: error.code };
  }
  console.error("[tracker]", error);
  return { ok: false, code: fallback };
}

export async function startSessionAction(activityType: string): Promise<ActionResult> {
  if (!isActivityType(activityType)) {
    return { ok: false, code: "ACTIVITY_REQUIRED" };
  }

  try {
    const user = await requireUser();
    await startSession({
      userId: user.id,
      userLanguageId: user.primaryLanguage.id,
      activityType,
      startedAt: new Date(),
    });
  } catch (error) {
    return toResult(error, "SESSION_START_FAILED");
  }

  revalidatePath("/");
  return { ok: true };
}

export async function stopSessionAction(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await stopSession({ userId: user.id, endedAt: new Date() });
  } catch (error) {
    return toResult(error, "SESSION_STOP_FAILED");
  }

  revalidatePath("/");
  return { ok: true };
}

export async function cancelSessionAction(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await cancelSession({ userId: user.id });
  } catch (error) {
    return toResult(error, "SESSION_DISCARD_FAILED");
  }

  revalidatePath("/");
  return { ok: true };
}

export async function addManualSessionAction(formData: FormData): Promise<ActionResult> {
  const read = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  };

  try {
    const user = await requireUser();
    const now = new Date();

    const parsed = validateManualEntry(
      {
        activityType: read("activityType"),
        hours: read("hours"),
        minutes: read("minutes"),
        date: read("date"),
        sourceTitle: read("sourceTitle"),
        note: read("note"),
      },
      { timeZone: user.timeZone, now },
    );

    if (!parsed.ok) {
      return { ok: false, code: parsed.code, field: parsed.field };
    }

    await createManualSession({
      userId: user.id,
      userLanguageId: user.primaryLanguage.id,
      ...parsed.value,
    });
  } catch (error) {
    return toResult(error, "SESSION_SAVE_FAILED");
  }

  revalidatePath("/");
  return { ok: true };
}
