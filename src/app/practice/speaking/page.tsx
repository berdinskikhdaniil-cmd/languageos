import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SpeakingPractice } from "@/features/speaking/components/speaking-practice";
import { pickTopic, speakingAvailableFor } from "@/features/speaking/domain/topics";
import { isSpeakingConfigured } from "@/lib/ai/config";
import { resolvePageAccess } from "@/lib/auth/page-access";
import { getMessages } from "@/lib/i18n/messages";

export const metadata: Metadata = { title: "Speaking" };

export const dynamic = "force-dynamic";

/**
 * Where a spoken answer is recorded.
 *
 * The upload and the transcription happen in a route handler, not here, so this
 * page has no long-running work of its own. The review that follows it does run
 * in an action called from this screen, which is what the duration is for.
 */
export const maxDuration = 60;

export default async function SpeakingPage() {
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

  const messages = getMessages(access.user.uiLanguage);
  const languageCode = access.user.primaryLanguage.code;

  /**
   * Two ways this screen cannot work, and they are told apart because the
   * learner can do something about neither but should still know which it is:
   * their language has no topics written for it yet, or this installation has
   * no transcription model configured.
   */
  if (!speakingAvailableFor(languageCode)) {
    return <Unavailable title={messages.speaking.title} body={messages.speaking.unavailableForLanguage} />;
  }
  if (!isSpeakingConfigured()) {
    return <Unavailable title={messages.speaking.title} body={messages.speaking.notConfigured} />;
  }

  /**
   * The first topic is chosen on the server, so the screen renders the same
   * sentence the HTML was built with. Picking another is a tap, and that one
   * happens on the client where a random choice costs nothing.
   */
  const topic = pickTopic(languageCode);
  if (!topic) {
    return <Unavailable title={messages.speaking.title} body={messages.speaking.unavailableForLanguage} />;
  }

  return <SpeakingPractice languageCode={languageCode} initialTopic={topic} />;
}

function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col pt-3">
      <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.03em]">{title}</h1>
      <p className="mt-3 max-w-[24rem] text-[0.9375rem] leading-[1.5] text-muted">{body}</p>
    </div>
  );
}
