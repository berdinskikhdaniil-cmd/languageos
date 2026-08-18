import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlaceholderScreen } from "@/components/layout/placeholder-screen";
import { resolvePageAccess } from "@/lib/auth/page-access";

export const metadata: Metadata = { title: "Practice" };

/** Resolves identity per request, so it is never prerendered. */
export const dynamic = "force-dynamic";

export default async function PracticePage() {
  // Nothing here reads user data yet, but the gate is not about data: an
  // account that has not finished setup has one place to be, and typing a route
  // is not a way around it.
  const access = await resolvePageAccess();
  if (access.status === "onboarding-required") redirect("/onboarding");
  if (access.status === "signed-out") return null;

  return (
    <PlaceholderScreen
      title="Practice"
      description="Speaking, retellings and exercises built around what you're actually learning."
    />
  );
}
