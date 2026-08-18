"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getRawInitData } from "@/lib/telegram/web-app";
import { AuthScreen } from "./auth-screen";

type Phase = "checking" | "signing-in" | "outside-telegram" | "failed";

/**
 * Trades the Telegram launch payload for one of our sessions, once, at startup.
 *
 * Rendered only when the server found no session. Telegram itself is the login
 * step, so there is no form and no separate login route: read initData, post it,
 * and re-render the app as the authenticated user.
 *
 * Opened in a plain browser with no development bypass, it says so instead of
 * showing somebody else's data.
 */
export function AuthBootstrap() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const signIn = useCallback(async () => {
    const initData = getRawInitData();

    if (!initData) {
      setPhase("outside-telegram");
      return;
    }

    setPhase("signing-in");
    setError(null);

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
        setError(payload?.error ?? "Could not sign you in right now.");
        setPhase("failed");
        return;
      }

      // The cookie is set. Re-render the tree so the server picks it up.
      router.refresh();
    } catch {
      setError("No connection to the server.");
      setPhase("failed");
    }
  }, [router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void signIn();
  }, [signIn]);

  if (phase === "outside-telegram") {
    return <AuthScreen message="Open Language OS from Telegram to continue." />;
  }

  if (phase === "failed") {
    return (
      <AuthScreen message={error ?? "Could not sign you in right now."}>
        <button
          type="button"
          onClick={() => void signIn()}
          className="mt-6 h-12 rounded-[var(--radius-control)] bg-accent px-6 text-[0.9375rem] font-bold text-accent-ink transition-colors active:bg-accent-pressed"
        >
          Try again
        </button>
      </AuthScreen>
    );
  }

  return <AuthScreen message="Signing you in…" />;
}
