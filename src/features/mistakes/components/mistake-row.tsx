import { ChevronRight } from "lucide-react";
import Link from "next/link";

/**
 * One weak point, as something that obviously opens.
 *
 * Weak points and repeated skills are the two ways into the history, and they
 * are the same object twice — a name, how often, and where — so they are one
 * component rather than two lists that would drift apart.
 *
 * The affordance is carried by the surface rather than by an outline: a filled
 * tone that lifts under a finger, and a chevron. That is the pattern the
 * tracker's tiles already use, so a tappable thing looks the same everywhere in
 * the product. Rows sit apart from each other instead of sharing hairlines,
 * because a divider says "these are lines of one list" and a gap says "each of
 * these is a thing you can open" — which is the actual difference here.
 *
 * Three lines at most, in falling weight: what it is, how much of it, and where
 * it happened. The last is optional, because a skill with nothing to break down
 * should not be given an empty line to fill.
 */
export function MistakeRow({
  href,
  title,
  detail,
  meta,
}: {
  href: string;
  title: string;
  detail: string;
  meta?: string | null;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-[var(--radius-tile)] bg-surface px-4 py-3.5 transition-colors active:bg-surface-raised"
      >
        {/* min-w-0 is what lets a long Russian category name wrap instead of
            pushing the chevron off the right edge. */}
        <span className="min-w-0 flex-1">
          <span className="block break-words text-[0.9375rem] font-semibold leading-snug">
            {title}
          </span>
          <span className="mt-1 block text-[0.875rem] leading-snug text-muted">{detail}</span>
          {meta ? (
            <span className="mt-0.5 block text-[0.8125rem] leading-snug text-faint">{meta}</span>
          ) : null}
        </span>

        <ChevronRight
          size={18}
          strokeWidth={2}
          aria-hidden
          className="shrink-0 text-faint"
        />
      </Link>
    </li>
  );
}
