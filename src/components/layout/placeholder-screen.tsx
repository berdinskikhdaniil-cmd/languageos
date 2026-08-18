type PlaceholderScreenProps = {
  title: string;
  description: string;
};

/**
 * Holds a route that is planned but not built yet. Typography and space only —
 * no decorative icon tile, no "coming soon" stamp.
 */
export function PlaceholderScreen({ title, description }: PlaceholderScreenProps) {
  return (
    <section className="flex min-h-[62vh] flex-col justify-center px-1">
      <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.03em]">{title}</h1>
      <p className="mt-3 max-w-[22rem] text-[1.0625rem] leading-[1.5] text-muted">{description}</p>
    </section>
  );
}
