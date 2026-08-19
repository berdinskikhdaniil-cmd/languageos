import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WritingComposer } from "@/features/writing/components/writing-composer";
import { resolvePageAccess } from "@/lib/auth/page-access";
import { displayLanguageName } from "@/lib/i18n/language-names";
import { getMessages } from "@/lib/i18n/messages";

export const metadata: Metadata = { title: "Writing" };

export const dynamic = "force-dynamic";

/**
 * The review runs inside the submit action, and a language model is not fast.
 * Without this the platform's default timeout can cut the request off while the
 * provider is still answering, which would fail a review that was about to work.
 */
export const maxDuration = 60;

export default async function WritingPage() {
  const access = await resolvePageAccess();
  if (access.status === "onboarding-required") redirect("/onboarding");
  if (access.status === "signed-out") return null;
  if (access.status === "unavailable") {
    const messages = getMessages();
    return (
      <section className="rounded-[var(--radius-card)] bg-surface p-5">
        <p className="text-[1.0625rem] font-semibold leading-snug">
          {messages.writing.composerUnavailableTitle}
        </p>
        <p className="mt-2 text-[0.9375rem] leading-[1.5] text-muted">
          {messages.writing.composerUnavailableBody}
        </p>
      </section>
    );
  }

  /**
   * The learning language is named for the reader, not for the database: the
   * screen says "Немецкий" while the row still says `de` and "German". The code
   * goes through untouched, because it is what segments the word count.
   */
  return (
    <WritingComposer
      languageName={displayLanguageName(
        access.user.primaryLanguage.code,
        access.user.primaryLanguage.name,
        access.user.uiLanguage,
      )}
      languageCode={access.user.primaryLanguage.code}
    />
  );
}
