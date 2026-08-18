"use client";

import { useEffect } from "react";

// `window.Telegram` is typed by the global augmentation in @/lib/telegram/types.

const VIEWPORT_EVENTS = ["viewportChanged", "safeAreaChanged", "contentSafeAreaChanged"];

/**
 * Feeds Telegram's viewport and safe-area values into the CSS variables the
 * shell lays out against. Outside Telegram it does nothing, and the `env()`
 * fallbacks in globals.css keep the layout correct in a plain browser.
 *
 * The `telegram-web-app.js` script that defines `window.Telegram` is added
 * alongside authentication in a later iteration.
 */
export function TelegramViewport() {
  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;

    webApp.ready();
    webApp.expand();

    const sync = () => {
      const root = document.documentElement;
      const top = webApp.contentSafeAreaInset?.top ?? webApp.safeAreaInset?.top;
      const bottom = webApp.safeAreaInset?.bottom;

      if (typeof top === "number") root.style.setProperty("--safe-top", `${top}px`);
      if (typeof bottom === "number") root.style.setProperty("--safe-bottom", `${bottom}px`);
      if (webApp.viewportStableHeight) {
        root.style.setProperty("--app-height", `${webApp.viewportStableHeight}px`);
      }
    };

    sync();
    for (const event of VIEWPORT_EVENTS) webApp.onEvent(event, sync);
    return () => {
      for (const event of VIEWPORT_EVENTS) webApp.offEvent(event, sync);
    };
  }, []);

  return null;
}
