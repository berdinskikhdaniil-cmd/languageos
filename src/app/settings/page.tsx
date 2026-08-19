import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InterfaceLanguageSetting } from "@/features/settings/components/interface-language-setting";
import { resolvePageAccess } from "@/lib/auth/page-access";
import { getMessages } from "@/lib/i18n/messages";

export const metadata: Metadata = { title: "Settings" };

/** Resolves identity per request, so it is never prerendered. */
export const dynamic = "force-dynamic";

/**
 * Settings, with one setting in it.
 *
 * Deliberately not a card and not a list of empty rows waiting for features:
 * there is one thing a learner can change today, so the screen says so plainly.
 * Timezone, learning language and daily goal are still one-way — none of them is
 * shown here as a disabled row, because a control that cannot be used is worse
 * than its absence.
 */
export default async function SettingsPage() {
  const access = await resolvePageAccess();
  if (access.status === "onboarding-required") redirect("/onboarding");
  if (access.status === "signed-out") return null;

  /**
   * With identity unreadable there is no preference to show and nothing that
   * could be saved. The onboarding copy fits exactly: the database is not
   * answering, reload in a moment.
   */
  if (access.status === "unavailable") {
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

  const messages = getMessages(access.user.uiLanguage);

  return (
    <div className="flex flex-col gap-8 pt-3">
      <header>
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.03em]">
          {messages.settings.title}
        </h1>
      </header>

      <InterfaceLanguageSetting current={access.user.uiLanguage} />
    </div>
  );
}
