import { ChartLine, House, Library, MicVocal, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/** The four places a learner moves between. Settings is reached from the avatar. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/practice", label: "Practice", icon: MicVocal },
  { href: "/progress", label: "Progress", icon: ChartLine },
  { href: "/library", label: "Library", icon: Library },
];
