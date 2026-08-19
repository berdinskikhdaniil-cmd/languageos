"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_UI_LANGUAGE, type UiLanguage } from "./locale";
import { getMessages, type Messages } from "./messages";

/**
 * How a client component learns which language to speak.
 *
 * The provider is rendered by the root layout, on the server, from
 * `users.ui_language`. Only the two-letter code crosses the boundary — a
 * dictionary holds functions and could not be serialised anyway — and each
 * client component turns that code back into the dictionary itself. Both
 * dictionaries are a few kilobytes of static strings, so shipping the pair is
 * cheaper than any arrangement that fetches one.
 *
 * Server components do not use this. They read the language from
 * `resolvePageAccess()` and call `getMessages()` directly, which is what keeps
 * the first HTML already in the right language instead of flipping after
 * hydration.
 *
 * The default is English rather than a thrown error: a component rendered
 * outside the provider — in a unit test, say — should render, not crash.
 */
const LocaleContext = createContext<UiLanguage>(DEFAULT_UI_LANGUAGE);

export function LocaleProvider({
  language,
  children,
}: {
  language: UiLanguage;
  children: ReactNode;
}) {
  return <LocaleContext.Provider value={language}>{children}</LocaleContext.Provider>;
}

export function useUiLanguage(): UiLanguage {
  return useContext(LocaleContext);
}

export function useMessages(): Messages {
  return getMessages(useContext(LocaleContext));
}
