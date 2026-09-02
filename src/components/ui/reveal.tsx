"use client";

// Reveal — docs/SCREENS.md §0.4
//
// Staggered mount animation. Every top-level region of a screen is wrapped in
// one, with `index` counting down the page (§2.2: header is index 0, fabric
// block i is index i+1). The stagger is what makes a dense screen read as
// arriving in order rather than all at once.
//
// The animation itself lives in globals.css (`.ld-reveal` + the `ld-reveal`
// keyframes) so `prefers-reduced-motion: reduce` can switch it off in CSS —
// before first paint, which a matchMedia hook cannot do.

import * as React from "react";
import { cn } from "@/lib/utils";

const STEP_MS = 55;
/** Beyond this the last card would arrive noticeably late; the stagger caps. */
const MAX_DELAY_MS = 400;

export type RevealProps = React.ComponentProps<"div"> & {
  /** Position in the stagger. 0 = first, no delay. */
  index?: number;
  /** Milliseconds between consecutive indices. */
  step?: number;
};

export function Reveal({
  index = 0,
  step = STEP_MS,
  className,
  style,
  ...props
}: RevealProps) {
  const delay = Math.min(Math.max(index, 0) * step, MAX_DELAY_MS);
  return (
    <div
      className={cn("ld-reveal", className)}
      style={
        {
          ...style,
          "--ld-reveal-delay": `${delay}ms`,
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
