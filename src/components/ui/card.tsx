import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

/** A raised surface. Lifts by luminance — no border unless one is passed in. */
export function Card({ className, ...props }: ComponentPropsWithoutRef<"section">) {
  return (
    <section
      className={cn("rounded-[var(--radius-card)] bg-surface p-5", className)}
      {...props}
    />
  );
}
