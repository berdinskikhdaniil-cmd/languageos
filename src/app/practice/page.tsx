import type { Metadata } from "next";
import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import { RecentWriting } from "@/features/writing/components/recent-writing";
import { getRecentWritingEntries, type RecentWritingEntry } from "@/features/writing/data/entries";
import { resolvePageAccess } from "@/lib/auth/page-access";

export const metadata: Metadata = { title: "Practice" };

/** Resolves identity per request, so it is never prerendered. */
export const dynamic = "force-dynamic";

export default async function PracticePage() {
  const access = await resolvePageAccess();
  if (access.status === "onboarding-required") redirect("/onboarding");
  if (access.status === "signed-out") return null;

  /**
   * Both ids come from the server's own user context. The list is scoped to the
   * language being studied as well as to the account, so switching languages
   * later shows that language's work rather than everything ever written.
   *
   * A failure here costs the list, not the page: "Start writing" is what this
   * screen is for, and it should survive a query that did not answer.
   */
  let recent: RecentWritingEntry[] = [];
  if (access.status === "ready") {
    try {
      recent = await getRecentWritingEntries({
        userId: access.user.id,
        userLanguageId: access.user.primaryLanguage.id,
      });
    } catch (error) {
      unstable_rethrow(error);
      console.error("[practice] could not read recent writing", error);
    }
  }

  return (
    <div className="flex flex-col gap-8 pt-3">
      <header>
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.03em]">Practice</h1>
        <p className="mt-2.5 max-w-[24rem] text-[0.9375rem] leading-[1.5] text-muted">
          Use the language, not just consume it.
        </p>
      </header>

      <section>
        <h2 className="text-[1.0625rem] font-bold tracking-[-0.02em]">Writing</h2>
        <p className="mt-1.5 max-w-[24rem] text-[0.9375rem] leading-[1.5] text-muted">
          Write something, and get it back with the mistakes marked, explained and corrected.
        </p>
        <Link
          href="/practice/writing"
          className="mt-4 flex h-14 w-full items-center justify-center rounded-[var(--radius-control)] bg-accent text-[0.9375rem] font-bold text-accent-ink transition-colors active:bg-accent-pressed"
        >
          Start writing
        </Link>

        {access.status === "ready" ? (
          <RecentWriting
            entries={recent}
            timeZone={access.user.timeZone}
            now={new Date()}
          />
        ) : null}
      </section>

      <section>
        <h2 className="text-[1.0625rem] font-bold tracking-[-0.02em] text-muted">Speaking</h2>
        <p className="mt-1.5 max-w-[24rem] text-[0.9375rem] leading-[1.5] text-faint">
          Speaking practice is coming next.
        </p>
      </section>
    </div>
  );
}
