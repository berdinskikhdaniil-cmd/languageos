import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SpeakingAttemptView } from "@/features/speaking/components/speaking-attempt-view";
import { getSpeakingAttempt } from "@/features/speaking/data/attempts";
import { buildAttemptView } from "@/features/speaking/domain/attempt-view";
import { resolvePageAccess } from "@/lib/auth/page-access";
import { getMessages } from "@/lib/i18n/messages";

export const metadata: Metadata = { title: "Speaking" };

export const dynamic = "force-dynamic";

/** A retry runs the provider call inside a server action on this page. */
export const maxDuration = 60;

/**
 * One spoken answer, and its review.
 *
 * The attempt is fetched with the caller's own user id, so an id belonging to
 * somebody else is simply not found — the URL is not an access token, and there
 * is no difference between "does not exist" and "is not yours".
 *
 * This is a real route rather than a state inside the recorder because the
 * result outlives the session that produced it: closing the Mini App and coming
 * back has to land on the same feedback, and a screen held in component state
 * would not survive that.
 */
export default async function SpeakingAttemptPage({
  params,
}: PageProps<"/practice/speaking/[attemptId]">) {
  const access = await resolvePageAccess();
  if (access.status === "onboarding-required") redirect("/onboarding");
  if (access.status === "signed-out") return null;

  if (access.status === "unavailable") {
    const messages = getMessages();
    return (
      <section className="rounded-[var(--radius-card)] bg-surface p-5">
        <p className="text-[1.0625rem] font-semibold leading-snug">
          {messages.writing.entryUnavailableTitle}
        </p>
        <p className="mt-2 text-[0.9375rem] leading-[1.5] text-muted">
          {messages.writing.entryUnavailableBody}
        </p>
      </section>
    );
  }

  const { attemptId } = await params;
  const detail = await getSpeakingAttempt(attemptId, access.user.id);
  if (!detail) notFound();

  return <SpeakingAttemptView attempt={buildAttemptView(detail)} />;
}
