import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { TelegramViewport } from "@/components/layout/telegram-viewport";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>
        <TelegramViewport />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
