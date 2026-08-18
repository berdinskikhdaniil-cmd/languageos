import type { Metadata } from "next";
import { PlaceholderScreen } from "@/components/layout/placeholder-screen";

export const metadata: Metadata = { title: "Progress" };

export default function ProgressPage() {
  return (
    <PlaceholderScreen
      title="Progress"
      description="Hours with the language, error rates by category, and your first recording next to your latest one."
    />
  );
}
