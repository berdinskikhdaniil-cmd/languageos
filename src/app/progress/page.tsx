import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlaceholderScreen } from "@/components/layout/placeholder-screen";
import { resolvePageAccess } from "@/lib/auth/page-access";

export const metadata: Metadata = { title: "Progress" };

/** Resolves identity per request, so it is never prerendered. */
export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  // Nothing here reads user data yet, but the gate is not about data: an
  // account that has not finished setup has one place to be, and typing a route
  // is not a way around it.
  const access = await resolvePageAccess();
  if (access.status === "onboarding-required") redirect("/onboarding");
  if (access.status === "signed-out") return null;

  return (
    <PlaceholderScreen
      title="Progress"
      description="Hours with the language, error rates by category, and your first recording next to your latest one."
    />
  );
}
