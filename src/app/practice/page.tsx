import type { Metadata } from "next";
import { PlaceholderScreen } from "@/components/layout/placeholder-screen";

export const metadata: Metadata = { title: "Practice" };

export default function PracticePage() {
  return (
    <PlaceholderScreen
      title="Practice"
      description="Speaking, retellings and exercises built around what you're actually learning."
    />
  );
}
