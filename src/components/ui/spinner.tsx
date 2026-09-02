// Spinner — docs/SCREENS.md §0.4
//
// The inline "working" indicator. Used inside buttons while a mutation is
// pending (`<Spinner /> Saving…`), in place of a Refresh icon while a query
// is fetching, and in the empty-state row while a list loads.

import { cn } from "@/lib/utils";

export function Spinner({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]",
        // `border-current` means the spinner takes the colour of whatever it
        // sits in — a ghost button's text, a danger button's red — without a
        // tone prop. `motion-reduce:animate-none` leaves a static ring rather
        // than a spinning one for people who asked for less motion.
        "motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}
