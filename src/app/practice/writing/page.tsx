import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WritingComposer } from "@/features/writing/components/writing-composer";
import { resolvePageAccess } from "@/lib/auth/page-access";

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
    return (
      <section className="rounded-[var(--radius-card)] bg-surface p-5">
        <p className="text-[1.0625rem] font-semibold leading-snug">Writing is not reachable.</p>
        <p className="mt-2 text-[0.9375rem] leading-[1.5] text-muted">
          The database is not responding. Reload in a moment.
        </p>
      </section>
    );
  }

  return (
    <WritingComposer
      languageName={access.user.primaryLanguage.name}
      languageCode={access.user.primaryLanguage.code}
    />
  );
}
