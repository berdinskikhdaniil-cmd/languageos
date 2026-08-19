import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlaceholderScreen } from "@/components/layout/placeholder-screen";
import { resolvePageAccess } from "@/lib/auth/page-access";
import { getMessages } from "@/lib/i18n/messages";

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

  const { placeholders } = getMessages(
    access.status === "ready" ? access.user.uiLanguage : undefined,
  );

  return (
    <PlaceholderScreen
      title={placeholders.library.title}
      description={placeholders.library.description}
    />
  );
}
