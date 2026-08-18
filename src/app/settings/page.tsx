import type { Metadata } from "next";
import { PlaceholderScreen } from "@/components/layout/placeholder-screen";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <PlaceholderScreen
      title="Settings"
      description="Languages you are studying, weekly goals, reminders and your account."
    />
  );
}
