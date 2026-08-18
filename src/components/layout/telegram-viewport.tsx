"use client";

import { useEffect } from "react";
import {
  getTelegramWebApp,
  notifyReady,
  readViewportMetrics,
  requestExpand,
  subscribeToViewport,
} from "@/lib/telegram/web-app";

/**
 * Wires the Telegram viewport into the CSS variables the shell lays out against,
 * and tells Telegram we are ready.
 *
 * Recent Telegram clients publish `--tg-safe-area-inset-*` and friends
 * themselves, and globals.css already prefers them. This component covers the
 * clients that expose the JavaScript API but not the CSS variables, and keeps
 * the values current as the viewport changes. Outside Telegram it does nothing
 * and the `env()` fallbacks in globals.css apply.
 */
export function TelegramViewport() {
  useEffect(() => {
    if (!getTelegramWebApp()) return;

    // The interface is painted by the time an effect runs, which is when
    // Telegram wants to be told it can drop its own loading placeholder.
    notifyReady();
    requestExpand();

    const sync = () => {
      const metrics = readViewportMetrics();
      if (!metrics) return;

      const root = document.documentElement;
      const set = (name: string, value: number | null | undefined) => {
        if (typeof value === "number") root.style.setProperty(name, `${value}px`);
      };

      set("--tg-safe-area-inset-top", metrics.safeArea?.top);
      set("--tg-safe-area-inset-bottom", metrics.safeArea?.bottom);
      set("--tg-content-safe-area-inset-top", metrics.contentSafeArea?.top);
      set("--tg-content-safe-area-inset-bottom", metrics.contentSafeArea?.bottom);
      set("--tg-viewport-stable-height", metrics.stableHeight);
    };

    sync();
    return subscribeToViewport(sync);
  }, []);

  return null;
}
