import type { Messages } from "@/lib/i18n/messages";
import { toStoredTarget } from "../domain/target";
import type { WeakSpot } from "../domain/weak-spots";
import { targetTitle } from "./target-title";
import { WeakSpotRow } from "./weak-spot-row";

/**
 * The few things worth drilling, on the Practice hub.
 *
 * Read off real reviews and nothing else: a section with nothing behind it is
 * not drawn at all rather than drawn empty, exactly as every section on
 * Progress works. Somebody who has never had a piece of writing reviewed has no
 * weak points, and inventing three for them would be the first illustrative
 * number in the product.
 *
 * Concrete mistakes only. A note that a sentence was wordy is a suggestion, and
 * a drill built on one would teach that a matter of taste was an error.
 */
export function WeakSpots({ spots, messages }: { spots: WeakSpot[]; messages: Messages }) {
  if (spots.length === 0) return null;

  return (
    <section>
      <h2 className="text-[1.0625rem] font-bold tracking-[-0.02em]">
        {messages.mistakePractice.weakSpots}
      </h2>
      <p className="mt-1.5 max-w-[24rem] text-[0.9375rem] leading-[1.5] text-muted">
        {messages.mistakePractice.weakSpotsHint}
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {spots.map((spot) => {
          const target = toStoredTarget(spot.target);
          return (
            <WeakSpotRow
              key={`${target.type}:${target.key}`}
              target={target}
              title={targetTitle(spot.target, spot.label, messages)}
              detail={messages.progress.mistakeCount(spot.mistakes)}
            />
          );
        })}
      </ul>
    </section>
  );
}
