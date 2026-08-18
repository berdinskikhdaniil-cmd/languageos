"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, isOnboarded } from "@/lib/auth/current-user";
import { completeOnboarding } from "./data/complete";
import {
  validateOnboardingSubmission,
  type OnboardingField,
  type OnboardingSubmissionRaw,
} from "./domain/submission";

/**
 * Finishing first-run setup.
 *
 * The client sends a language code, a timezone and a number of minutes. It does
 * not send who it is: the account comes from the session, exactly as everywhere
 * else. A failure is reported back to the step that caused it rather than
 * thrown at the learner.
 */

export type OnboardingResult = { ok: false; error: string; field?: OnboardingField };

const SIGNED_OUT = "Your session has expired. Reopen the app from Telegram.";

export async function completeOnboardingAction(
  raw: OnboardingSubmissionRaw,
): Promise<OnboardingResult> {
  const parsed = validateOnboardingSubmission(raw);
  if (!parsed.ok) {
    return { ok: false, error: parsed.message, field: parsed.field };
  }

  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: SIGNED_OUT };

    // Already set up: nothing to write, and the dashboard is where they belong.
    if (!isOnboarded(user)) {
      await completeOnboarding({ userId: user.id, submission: parsed.value });
    }
  } catch (error) {
    console.error("[onboarding] could not complete setup", error);
    return { ok: false, error: "Could not save your setup. Try again." };
  }

  // The shell itself changes shape once an account is set up — header, bottom
  // navigation and the gate on every page all read this state.
  revalidatePath("/", "layout");
  // Outside the try: redirect works by throwing, and catching it here would
  // turn a successful setup into an error message.
  redirect("/");
}
