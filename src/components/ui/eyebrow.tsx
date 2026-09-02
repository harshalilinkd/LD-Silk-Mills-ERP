// Eyebrow — docs/SCREENS.md §0.4, §2.3
//
// The small uppercase pill that labels a mode or a section without competing
// with the heading beside it. The order form shows `<Eyebrow>Editing</Eyebrow>`
// in edit mode and nothing in create mode.
//
// Spec type: `rounded-pill px-2.5 py-1 text-[11px] font-semibold uppercase
// tracking-[0.08em]` on the accent wash. Colours translated to our tokens:
// accent-soft → bg-accent (our --accent is already a translucent teal wash),
// accent → text-accent-text.

import { cn } from "@/lib/utils";

export function Eyebrow({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill bg-accent px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] text-accent-text uppercase",
        className,
      )}
      {...props}
    />
  );
}
