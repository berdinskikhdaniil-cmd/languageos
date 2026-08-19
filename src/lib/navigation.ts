import { ChartLine, House, Library, MicVocal, type LucideIcon } from "lucide-react";
import type { Messages } from "./i18n/messages";

/** The key its label is stored under. The route, not the word, is the identity. */
export type NavId = keyof Messages["nav"];

export type NavItem = {
  href: string;
  id: NavId;
  icon: LucideIcon;
};

/**
 * The four places a learner moves between. Settings is reached from the avatar.
 *
 * No label here: the bar draws one from the dictionary, in whichever language
 * the reader chose. What this file fixes is the order, the routes and the icons.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", id: "home", icon: House },
  { href: "/practice", id: "practice", icon: MicVocal },
  { href: "/progress", id: "progress", icon: ChartLine },
  { href: "/library", id: "library", icon: Library },
];

/**
 * Routes the bottom navigation stays out of the way of.
 *
 * Writing is a text box and a keyboard on a phone screen, and a bar fixed above
 * the keyboard would take a line of it while covering what is being typed. The
 * writing screens carry their own way back instead. Targeted practice is the
 * same shape — one prompt, one input, one button — and is listed for the same
 * reason.
 *
 * It lives here rather than inside the bar because the bar is not the only
 * thing that has to know: anything else pinned to the bottom edge has to sit
 * clear of it, and two copies of this predicate would drift apart the moment a
 * route was added to one and not the other. That is exactly how the correction
 * panel came to be clipped on the speaking screens — the bar was showing there,
 * and the panel had been written for the screens where it is not.
 */
export function hidesBottomNav(pathname: string): boolean {
  return pathname.startsWith("/practice/writing") || pathname.startsWith("/practice/mistakes");
}
