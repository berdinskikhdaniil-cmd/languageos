import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlaceholderScreen } from "@/components/layout/placeholder-screen";
import { resolvePageAccess } from "@/lib/auth/page-access";

export const metadata: Metadata = { title: "Library" };

/** Resolves identity per request, so it is never prerendered. */
export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  // Nothing here reads user data yet, but the gate is not about data: an
  // account that has not finished setup has one place to be, and typing a route
  // is not a way around it.
  const access = await resolvePageAccess();
  if (access.status === "onboarding-required") redirect("/onboarding");
  if (access.status === "signed-out") return null;

  return (
    <PlaceholderScreen
      title="Library"
      description="Everything you have watched, read and listened to, plus the words and phrases you saved from it."
    />
  );
}
