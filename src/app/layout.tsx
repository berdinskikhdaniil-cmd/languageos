import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { unstable_rethrow } from "next/navigation";
import Script from "next/script";
import { AuthBootstrap } from "@/components/auth/auth-bootstrap";
import { AppShell } from "@/components/layout/app-shell";
import { SetupShell } from "@/components/layout/setup-shell";
import { TelegramViewport } from "@/components/layout/telegram-viewport";
import { getCurrentUser, isOnboarded, type CurrentUser } from "@/lib/auth/current-user";
import "./globals.css";

/** The only typeface in the product. See docs/design-system.md. */
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Language OS",
    template: "%s · Language OS",
  },
  description:
    "Track every hour you spend with a language, practise what you studied, and see whether it is working.",
  applicationName: "Language OS",
};

export const viewport: Viewport = {
  themeColor: "#0a0b0d",
  width: "device-width",
  initialScale: 1,
  // Required for env(safe-area-inset-*) to report real values.
  viewportFit: "cover",
  // An on-screen keyboard shrinks the viewport instead of overlaying the sheet.
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  /**
   * Every route is behind authentication, so the gate lives here.
   *
   * Four outcomes, kept distinct on purpose. A signed-in, set-up user gets the
   * app. A signed-in account that has not finished onboarding gets the bare
   * setup column instead — no header, no bottom navigation, nothing of the
   * product showing through behind it. No session at all means the bootstrap
   * screen, never somebody else's data. And if identity itself could not be
   * resolved (the database is unreachable) we do *not* claim the visitor is
   * signed out; the app renders and each screen reports its own unavailability.
   *
   * This is the shape of the interface, not the boundary. Which chrome a layout
   * draws is a presentation decision — React still renders the page beneath it —
   * so every route resolves its own access as well. See lib/auth/page-access.
   */
  let user: CurrentUser | null = null;
  let identityUnavailable = false;

  try {
    user = await getCurrentUser();
  } catch (error) {
    // `cookies()` throws a control-flow error to tell Next.js this render is
    // dynamic. Swallowing it would hide that signal and let the shell be
    // treated as prerenderable, so it goes back to the framework untouched;
    // only a genuine infrastructure failure reaches the line below.
    unstable_rethrow(error);
    identityUnavailable = true;
    console.error("[auth] could not resolve identity", error);
  }

  const needsSetup = user !== null && !isOnboarded(user);
  const showApp = user !== null || identityUnavailable;

  return (
    <html lang="en" className={manrope.variable}>
      <head>
        {/*
          Telegram's own bridge, which is what defines `window.Telegram.WebApp`.
          It must run before hydration, because the auth bootstrap reads initData
          in its first effect. Outside Telegram the script still loads but reports
          an empty initData, which is exactly how we detect "not a Mini App".
        */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js?57"
          strategy="beforeInteractive"
        />
      </head>
      <body>
        <TelegramViewport />
        {needsSetup ? (
          <SetupShell>{children}</SetupShell>
        ) : showApp ? (
          <AppShell user={user}>{children}</AppShell>
        ) : (
          <AuthBootstrap />
        )}
      </body>
    </html>
  );
}
