import type { Metadata } from "next";
import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import { ResumePractice } from "@/features/mistake-practice/components/resume-practice";
import { WeakSpots } from "@/features/mistake-practice/components/weak-spots";
import { getResumablePractice, type ResumablePractice as ResumablePracticeRow } from "@/features/mistake-practice/data/sessions";
import { loadWeakSpots } from "@/features/mistake-practice/data/targets";
import type { WeakSpot } from "@/features/mistake-practice/domain/weak-spots";
import { RecentSpeaking } from "@/features/speaking/components/recent-speaking";
import {
  getRecentSpeakingAttempts,
  type RecentSpeakingAttempt,
} from "@/features/speaking/data/attempts";
import { speakingAvailableFor } from "@/features/speaking/domain/topics";
import { RecentWriting } from "@/features/writing/components/recent-writing";
import { getRecentWritingEntries, type RecentWritingEntry } from "@/features/writing/data/entries";
import { resolvePageAccess } from "@/lib/auth/page-access";
import { getMessages } from "@/lib/i18n/messages";

export const metadata: Metadata = { title: "Practice" };

/** Resolves identity per request, so it is never prerendered. */
export const dynamic = "force-dynamic";

export default async function PracticePage() {
  const access = await resolvePageAccess();
  if (access.status === "onboarding-required") redirect("/onboarding");
  if (access.status === "signed-out") return null;

  const language = access.status === "ready" ? access.user.uiLanguage : undefined;
  const messages = getMessages(language);

  /**
   * Both lists are scoped to the account and to the language being studied, and
   * both ids come from the server's own user context. A failure costs the list,
   * not the page: the two "start" buttons are what this screen is for, and they
   * should survive a query that did not answer.
   */
  let recentWriting: RecentWritingEntry[] = [];
  let recentSpeaking: RecentSpeakingAttempt[] = [];
  /**
   * Targeted practice reads the mistake engine, which reads two more tables
   * again. It is the most likely of these to be slow and the least essential to
   * the screen, so it fails on its own rather than taking the lists with it.
   */
  let weakSpots: WeakSpot[] = [];
  let resumable: ResumablePracticeRow | null = null;

  if (access.status === "ready") {
    const scope = {
      userId: access.user.id,
      userLanguageId: access.user.primaryLanguage.id,
    };

    try {
      [recentWriting, recentSpeaking] = await Promise.all([
        getRecentWritingEntries(scope),
        getRecentSpeakingAttempts(scope),
      ]);
    } catch (error) {
      unstable_rethrow(error);
      console.error("[practice] could not read recent practice", error);
    }

    try {
      [weakSpots, resumable] = await Promise.all([
        loadWeakSpots(access.user),
        getResumablePractice(scope),
      ]);
    } catch (error) {
      unstable_rethrow(error);
      console.error("[practice] could not read weak spots", error);
    }
  }

  /** Speaking asks its questions in the language being learned. See domain/topics. */
  const speakingReady =
    access.status === "ready" && speakingAvailableFor(access.user.primaryLanguage.code);

  return (
    <div className="flex flex-col gap-8 pt-3">
      <header>
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.03em]">
          {messages.practice.title}
        </h1>
        <p className="mt-2.5 max-w-[24rem] text-[0.9375rem] leading-[1.5] text-muted">
          {messages.practice.intro}
        </p>
      </header>

      {/*
        An interrupted set comes first, above everything else on the screen.
        Somebody who left five exercises half-answered ten minutes ago did not
        open Practice to start a sixth thing.
      */}
      {resumable ? <ResumePractice practice={resumable} messages={messages} /> : null}

      {/*
        And then the weak points, above Writing and Speaking, because this is
        the end of the loop those two feed: study, write or speak, get it
        reviewed, and then work on what the review actually found.
      */}
      <WeakSpots spots={weakSpots} messages={messages} />

      <section>
        <h2 className="text-[1.0625rem] font-bold tracking-[-0.02em]">
          {messages.practice.writingHeading}
        </h2>
        <p className="mt-1.5 max-w-[24rem] text-[0.9375rem] leading-[1.5] text-muted">
          {messages.practice.writingIntro}
        </p>
        <Link
          href="/practice/writing"
          className="mt-4 flex h-14 w-full items-center justify-center rounded-[var(--radius-control)] bg-accent px-4 text-center text-[0.9375rem] font-bold leading-tight text-accent-ink transition-colors active:bg-accent-pressed"
        >
          {messages.practice.startWriting}
        </Link>

        {access.status === "ready" ? (
          <RecentWriting
            entries={recentWriting}
            timeZone={access.user.timeZone}
            language={access.user.uiLanguage}
            now={new Date()}
          />
        ) : null}
      </section>

      <section>
        <h2
          className={
            speakingReady
              ? "text-[1.0625rem] font-bold tracking-[-0.02em]"
              : "text-[1.0625rem] font-bold tracking-[-0.02em] text-muted"
          }
        >
          {messages.practice.speakingHeading}
        </h2>
        <p className="mt-1.5 max-w-[24rem] text-[0.9375rem] leading-[1.5] text-muted">
          {speakingReady ? messages.speaking.intro : messages.speaking.unavailableForLanguage}
        </p>

        {speakingReady ? (
          <>
            <Link
              href="/practice/speaking"
              className="mt-4 flex h-14 w-full items-center justify-center rounded-[var(--radius-control)] bg-accent px-4 text-center text-[0.9375rem] font-bold leading-tight text-accent-ink transition-colors active:bg-accent-pressed"
            >
              {messages.practice.startSpeaking}
            </Link>

            {access.status === "ready" ? (
              <RecentSpeaking
                attempts={recentSpeaking}
                timeZone={access.user.timeZone}
                language={access.user.uiLanguage}
                now={new Date()}
              />
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
