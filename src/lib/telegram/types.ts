/**
 * The slice of the Telegram WebApp bridge this app uses.
 *
 * Only what we actually call is modelled. Note `initDataUnsafe`: it is typed so
 * the shape is known, but it is never an authentication source — the server
 * verifies the signed `initData` string instead.
 */

export type TelegramSafeAreaInset = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

/** Telegram's own parse of initData. Unverified — display hints only. */
export type TelegramInitDataUnsafe = {
  user?: {
    id?: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    photo_url?: string;
  };
};

export type TelegramWebApp = {
  /** The signed launch payload. The only thing the server will trust. */
  initData?: string;
  initDataUnsafe?: TelegramInitDataUnsafe;
  version?: string;
  platform?: string;
  ready: () => void;
  expand: () => void;
  isExpanded?: boolean;
  /** Viewport height excluding transient chrome; stable enough to lay out against. */
  viewportStableHeight?: number;
  /** Device insets (notch, home indicator). Telegram 8.0+. */
  safeAreaInset?: TelegramSafeAreaInset;
  /** Additional insets from Telegram's own header. Telegram 8.0+. */
  contentSafeAreaInset?: TelegramSafeAreaInset;
  onEvent: (event: string, handler: () => void) => void;
  offEvent: (event: string, handler: () => void) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}
