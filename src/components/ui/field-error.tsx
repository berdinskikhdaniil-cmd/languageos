/** A calm inline message. No icon, no capsule, no alert box. */
export function FieldError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-2 text-[0.8125rem] leading-snug text-negative">
      {message}
    </p>
  );
}
