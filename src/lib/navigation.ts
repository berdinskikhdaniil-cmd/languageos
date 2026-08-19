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
