import type { Metadata } from "next";
import { PlaceholderScreen } from "@/components/layout/placeholder-screen";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  return (
    <PlaceholderScreen
      title="Library"
      description="Everything you have watched, read and listened to, plus the words and phrases you saved from it."
    />
  );
}
