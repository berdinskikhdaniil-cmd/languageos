/**
 * Shown when the tracker cannot be read at all — almost always a database that
 * is not running. It says what to do instead of pretending the numbers are zero.
 */
export function TrackerUnavailable() {
  return (
    <section className="rounded-[var(--radius-card)] bg-surface p-5">
      <p className="text-[1.0625rem] font-semibold leading-snug">
        Your tracker is not reachable right now.
      </p>
      <p className="mt-2 text-[0.9375rem] leading-[1.5] text-muted">
        The database is not responding. In local development, start it with{" "}
        <span className="text-fg">npm run db:up</span> and reload.
      </p>
    </section>
  );
}
