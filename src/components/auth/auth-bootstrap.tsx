"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_UI_LANGUAGE,
  uiLanguageFromBrowser,
  type UiLanguage,
} from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/messages";
import { getRawInitData } from "@/lib/telegram/web-app";
import { AuthScreen } from "./auth-screen";

type Phase = "checking" | "signing-in" | "outside-telegram" | "failed";
type Failure = "couldNotSignIn" | "noConnection" | "server";

/**
 * Trades the Telegram launch payload for one of our sessions, once, at startup.
 *
 * Rendered only when the server found no session. Telegram itself is the login
 * step, so there is no form and no separate login route: read initData, post it,
 * and re-render the app as the authenticated user.
 *
 * Opened in a plain browser with no development bypass, it says so instead of
 * showing somebody else's data.
 *
 * This is the one screen with no account behind it, so it is the one screen that
 * has to guess a language. It reads the browser's own, in an effect rather than
 * during render — the server has already sent English HTML and disagreeing with
 * it mid-hydration would be a mismatch, not a translation. The guess costs
 * nothing and is discarded the moment sign-in succeeds: from then on the answer
 * comes from `users.ui_language`.
 */
export function AuthBootstrap() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [language, setLanguage] = useState<UiLanguage>(DEFAULT_UI_LANGUAGE);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const started = useRef(false);

  const signIn = useCallback(async () => {
    const initData = getRawInitData();

    if (!initData) {
      setPhase("outside-telegram");
      return;
    }

    setPhase("signing-in");
    setFailure(null);
    setServerMessage(null);

    try {
      const response = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        /**
         * The endpoint's own wording, when it has any. It is English — those
         * messages predate this setting and there is no account to localise
         * them against yet — so it is used only where it says something the
         * generic line does not.
         */
        setServerMessage(payload?.error ?? null);
        setFailure(payload?.error ? "server" : "couldNotSignIn");
        setPhase("failed");
        return;
      }

      // The cookie is set. Re-render the tree so the server picks it up.
      router.refresh();
    } catch {
      setFailure("noConnection");
      setPhase("failed");
    }
  }, [router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    setLanguage(uiLanguageFromBrowser(navigator.languages ?? [navigator.language]));
    void signIn();
  }, [signIn]);

  const messages = getMessages(language);

  if (phase === "outside-telegram") {
    return <AuthScreen message={messages.auth.outsideTelegram} />;
  }

  if (phase === "failed") {
    const message =
      failure === "server" && serverMessage
        ? serverMessage
        : failure === "noConnection"
          ? messages.auth.noConnection
          : messages.auth.couldNotSignIn;

    return (
      <AuthScreen message={message}>
        <button
          type="button"
          onClick={() => void signIn()}
          className="mt-6 h-12 rounded-[var(--radius-control)] bg-accent px-6 text-[0.9375rem] font-bold text-accent-ink transition-colors active:bg-accent-pressed"
        >
          {messages.auth.tryAgain}
        </button>
      </AuthScreen>
    );
  }

  return <AuthScreen message={messages.auth.signingIn} />;
}
