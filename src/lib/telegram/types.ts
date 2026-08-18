/**
 * The slice of the Telegram WebApp bridge this iteration actually uses.
 *
 * Only viewport and safe-area concerns are modelled here. Authentication —
 * verifying `initData` on the server and resolving it to a user — is a separate
 * iteration and deliberately absent.
 */

export type TelegramSafeAreaInset = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  /** Viewport height excluding transient chrome; stable enough to lay out against. */
  viewportStableHeight?: number;
  /** Device insets (notch, home indicator). */
  safeAreaInset?: TelegramSafeAreaInset;
  /** Insets caused by Telegram's own header. */
  contentSafeAreaInset?: TelegramSafeAreaInset;
  onEvent: (event: string, handler: () => void) => void;
  offEvent: (event: string, handler: () => void) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}
