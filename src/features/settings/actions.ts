"use server";

import { revalidatePath } from "next/cache";
import {
  OnboardingIncompleteError,
  getCurrentUser,
  requireOnboarded,
} from "@/lib/auth/current-user";
import type { AppErrorCode } from "@/lib/errors";
import { isUiLanguage } from "@/lib/i18n/locale";
import { updateUiLanguage } from "./data/preferences";

/**
 * Everything Settings can change. Today that is one thing.
 *
 * The result is a stable code rather than a sentence, because the screen that
 * shows it is the only place that knows which language the reader is in — and
 * because the reader is about to change that language, so a message chosen on
 * the server would be a coin toss.
 */

export type SettingsActionResult = { ok: true } | { ok: false; code: AppErrorCode };

class SignedOutError extends Error {}

/**
 * Settings belongs to a set-up account. An account still in onboarding has one
 * place to be, and typing the route is not a way around it — the page redirects,
 * and this refuses as well, because a page gate is presentation and this is the
 * boundary.
 */
async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new SignedOutError();
  return requireOnboarded(user);
}

export async function setUiLanguageAction(value: unknown): Promise<SettingsActionResult> {
  // Validated before anything is resolved: an unknown code is a bad request,
  // not a database problem, and the enum column would refuse it anyway.
  if (!isUiLanguage(value)) return { ok: false, code: "UI_LANGUAGE_INVALID" };

  try {
    const user = await requireUser();
    const updated = await updateUiLanguage({ userId: user.id, uiLanguage: value });
    if (!updated) return { ok: false, code: "AUTH_EXPIRED" };
  } catch (error) {
    if (error instanceof SignedOutError) return { ok: false, code: "AUTH_EXPIRED" };
    if (error instanceof OnboardingIncompleteError) {
      return { ok: false, code: "ONBOARDING_REQUIRED" };
    }
    console.error("[settings] could not save the interface language", error);
    return { ok: false, code: "SETTINGS_SAVE_FAILED" };
  }

  /**
   * The whole shell is what changes: the header, the bottom navigation and every
   * screen's own words all come from this one value, so the layout is
   * revalidated rather than a single page.
   */
  revalidatePath("/", "layout");
  return { ok: true };
}
