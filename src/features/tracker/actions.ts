"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
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
 */

export type ActionResult = { ok: true } | { ok: false; error: string; field?: string };

const SIGNED_OUT = "Your session has expired. Reopen the app from Telegram.";

/**
 * Resolves the caller, or throws so the surrounding handler reports a failure.
 * Every mutation below runs against this user's own id — none of them accepts an
 * id, a session id or a language id from the client.
 */
class SignedOutError extends Error {}

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new SignedOutError(SIGNED_OUT);
  return user;
}

/**
 * TrackerError messages are written for the learner. Anything else is a real
 * fault (database down, bad connection string) and gets a generic message plus
 * a server-side log.
 */
function toResult(error: unknown, fallback: string): ActionResult {
  if (error instanceof SignedOutError) {
    return { ok: false, error: SIGNED_OUT };
  }
  if (error instanceof TrackerError) {
    return { ok: false, error: error.message };
  }
  console.error("[tracker]", error);
  return { ok: false, error: fallback };
}

export async function startSessionAction(activityType: string): Promise<ActionResult> {
  if (!isActivityType(activityType)) {
    return { ok: false, error: "Choose what you were doing." };
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
    return toResult(error, "Could not start the session. Try again.");
  }

  revalidatePath("/");
  return { ok: true };
}

export async function stopSessionAction(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await stopSession({ userId: user.id, endedAt: new Date() });
  } catch (error) {
    return toResult(error, "Could not stop the session. Try again.");
  }

  revalidatePath("/");
  return { ok: true };
}

export async function cancelSessionAction(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await cancelSession({ userId: user.id });
  } catch (error) {
    return toResult(error, "Could not discard the session. Try again.");
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
      return { ok: false, error: parsed.message, field: parsed.field };
    }

    await createManualSession({
      userId: user.id,
      userLanguageId: user.primaryLanguage.id,
      ...parsed.value,
    });
  } catch (error) {
    return toResult(error, "Could not save the session. Try again.");
  }

  revalidatePath("/");
  return { ok: true };
}
