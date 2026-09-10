"use client";

import * as React from "react";

/**
 * Is this viewport wide enough, right now?
 *
 * ── WHY THIS EXISTS WHEN TAILWIND ALREADY HAS BREAKPOINTS ────────────────
 *
 * Almost everything in this app should be a `md:` class and not this hook —
 * CSS needs no JavaScript, cannot flash the wrong layout, and does not
 * re-render. Reach for the hook only where the difference is in the MARKUP or
 * in a value that classes cannot reach: a component that must not receive its
 * drag handler on a touch screen, or an inline `style` that would otherwise
 * beat every class fighting it.
 *
 * The order-status panel is both. It is a draggable box pinned by inline
 * `left`/`top` on a desktop and a bottom sheet on a phone, and an inline style
 * wins against any class, so the position genuinely has to be decided in JS.
 *
 * ── IT STARTS FALSE, AND THAT IS THE SAFE WAY ROUND ──────────────────────
 *
 * The server has no window, so the first render on every device is the phone
 * layout, and a wide screen corrects itself on mount. That way a phone — the
 * device most likely to be on a slow connection — never paints the desktop
 * layout first and jumps. `matchMedia` is read inside the effect rather than
 * in the initial state, so the server and the first client render agree and
 * React never reports a hydration mismatch.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    // Older Safari has `matchMedia` but not `addEventListener` on the result;
    // a missing feature here should degrade to the phone layout, never throw.
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    if (mq.addEventListener) {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, [query]);

  return matches;
}

/** Tailwind's `md`. The one breakpoint this app splits panel shapes on. */
export const MD = "(min-width: 768px)";
