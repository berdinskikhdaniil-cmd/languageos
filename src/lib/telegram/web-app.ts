import type { TelegramSafeAreaInset, TelegramWebApp } from "./types";

/**
 * The single place that touches `window.Telegram`.
 *
 * Nothing else in the codebase reaches for the global, so the bridge can be
 * stubbed, versioned or replaced from here. No product logic lives in this
 * module — it reports what the environment offers and forwards calls.
 *
 * Every function is safe to call in a plain browser, where it reports absence.
 */

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/**
 * Whether we are running as a Mini App. Presence of the bridge alone is not
 * enough — a launch always carries initData, and without it there is nothing to
 * authenticate with.
 */
export function isTelegramMiniApp(): boolean {
  const webApp = getTelegramWebApp();
  return Boolean(webApp && typeof webApp.initData === "string" && webApp.initData.length > 0);
}

/** The raw signed launch payload, passed to the server untouched. */
export function getRawInitData(): string | null {
  const initData = getTelegramWebApp()?.initData;
  return initData && initData.length > 0 ? initData : null;
}

export type TelegramEnvironment = {
  platform: string | null;
  version: string | null;
};

export function getTelegramEnvironment(): TelegramEnvironment | null {
  const webApp = getTelegramWebApp();
  if (!webApp) return null;

  return {
    platform: webApp.platform ?? null,
    version: webApp.version ?? null,
  };
}

/** Tells Telegram the interface is drawn and it may hide its loading placeholder. */
export function notifyReady(): void {
  getTelegramWebApp()?.ready();
}

/** Asks Telegram for the full available height. Harmless if already expanded. */
export function requestExpand(): void {
  const webApp = getTelegramWebApp();
  if (!webApp || webApp.isExpanded) return;
  webApp.expand();
}

export type TelegramViewportMetrics = {
  safeArea: TelegramSafeAreaInset | null;
  contentSafeArea: TelegramSafeAreaInset | null;
  stableHeight: number | null;
};

export function readViewportMetrics(): TelegramViewportMetrics | null {
  const webApp = getTelegramWebApp();
  if (!webApp) return null;

  return {
    safeArea: webApp.safeAreaInset ?? null,
    contentSafeArea: webApp.contentSafeAreaInset ?? null,
    stableHeight: webApp.viewportStableHeight ?? null,
  };
}

/** Events that change the viewport or its insets. */
export const VIEWPORT_EVENTS = [
  "viewportChanged",
  "safeAreaChanged",
  "contentSafeAreaChanged",
] as const;

export function subscribeToViewport(handler: () => void): () => void {
  const webApp = getTelegramWebApp();
  if (!webApp) return () => {};

  for (const event of VIEWPORT_EVENTS) webApp.onEvent(event, handler);
  return () => {
    for (const event of VIEWPORT_EVENTS) webApp.offEvent(event, handler);
  };
}
