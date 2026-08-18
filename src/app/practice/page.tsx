import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { resolvePageAccess } from "@/lib/auth/page-access";

export const metadata: Metadata = { title: "Practice" };

/** Resolves identity per request, so it is never prerendered. */
export const dynamic = "force-dynamic";

export default async function PracticePage() {
  const access = await resolvePageAccess();
  if (access.status === "onboarding-required") redirect("/onboarding");
  if (access.status === "signed-out") return null;

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
