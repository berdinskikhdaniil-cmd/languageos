import { unstable_rethrow } from "next/navigation";
import { getCurrentUser, isOnboarded, type OnboardedUser } from "./current-user";

/**
 * What a screen is allowed to render, resolved on the server.
 *
 * Every route asks this before drawing anything. It is not a convenience for
 * the layout: React renders a page even when its layout chooses not to place
 * `children`, so a layout gate is presentation, not a boundary. The boundary is
 * the page refusing to render and the data layer refusing to answer.
 *
 * It reports rather than redirects, because `redirect()` works by throwing and
 * must be called outside the try/catch that tells a broken database apart from
 * a signed-out visitor.
 */

export type PageAccess =
  /** No session, and no development bypass. The root layout signs them in. */
  | { status: "signed-out" }
  /** Authenticated, but no language, timezone or goal yet. */
  | { status: "onboarding-required" }
  | { status: "ready"; user: OnboardedUser }
  /** Identity itself could not be read — almost always the database being down. */
  | { status: "unavailable" };

export async function resolvePageAccess(): Promise<PageAccess> {
  try {
    const user = await getCurrentUser();
    if (!user) return { status: "signed-out" };
    if (!isOnboarded(user)) return { status: "onboarding-required" };
    return { status: "ready", user };
  } catch (error) {
    // `cookies()` throws a control-flow error to mark this render dynamic.
    // Swallowing it would hide that signal from the framework.
    unstable_rethrow(error);
    console.error("[auth] could not resolve identity", error);
    return { status: "unavailable" };
  }
}
