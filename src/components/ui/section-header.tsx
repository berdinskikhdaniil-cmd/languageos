import type { ReactNode } from "react";

type SectionHeaderProps = {
  /** Sentence case. Never an uppercase overline. */
  label: string;
  /** Optional trailing slot — a value or a link. */
  children?: ReactNode;
};

export function SectionHeader({ label, children }: SectionHeaderProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-[0.8125rem] font-medium text-muted">{label}</h2>
      {children}
    </div>
  );
}
