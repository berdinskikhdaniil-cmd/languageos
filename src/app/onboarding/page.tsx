import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/features/onboarding/components/onboarding-flow";
import { resolvePageAccess } from "@/lib/auth/page-access";
import { getMessages } from "@/lib/i18n/messages";

export const metadata: Metadata = { title: "Set up" };

/** Per-request identity, so this screen is never prerendered. */
export const dynamic = "force-dynamic";

/**
 * First-run setup.
 *
 * The route is only ever the right answer for an authenticated account that is
 * not set up yet. Someone already onboarded is sent to the dashboard rather
 * than being offered a second chance to pick a language, and a visitor with no
 * session gets the sign-in screen the root layout renders.
 */
export default async function OnboardingPage() {
  const access = await resolvePageAccess();

  if (access.status === "ready") redirect("/");

  if (access.status === "unavailable") {
    // No row means no preference to read, so this one screen is English.
    const messages = getMessages();
    return (
      <section className="rounded-[var(--radius-card)] bg-surface p-5">
        <p className="text-[1.0625rem] font-semibold leading-snug">
          {messages.onboarding.unavailableTitle}
        </p>
        <p className="mt-2 text-[0.9375rem] leading-[1.5] text-muted">
          {messages.onboarding.unavailableBody}
        </p>
      </section>
    );
  }

  // Signed out: the root layout is already showing the sign-in screen.
  if (access.status !== "onboarding-required") return null;

  return <OnboardingFlow />;
}
