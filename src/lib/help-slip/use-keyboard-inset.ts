"use client";

import * as React from "react";

/**
 * How many pixels of the layout viewport are currently covered from the
 * bottom — in practice, the on-screen keyboard.
 *
 * Ported verbatim (behaviour, not styling) from the standalone app's
 * `src/hooks/useKeyboardInset.ts`.
 *
 * This exists because `position: fixed; bottom: 0` DOES NOT WORK on Android
 * Chrome. Fixed positioning resolves against the LAYOUT viewport, which does
 * not shrink when the keyboard opens; the keyboard is painted over the top of
 * it. So a pinned submit bar sits underneath the keyboard, invisible, on the
 * screen where being able to see the submit button is the entire point.
 *
 * The visual viewport is the part actually on screen. The gap between the two
 * is the keyboard:
 *
 *   inset = innerHeight - (visualViewport.height + visualViewport.offsetTop)
 *
 * `offsetTop` matters: when the page is pinch-zoomed, or the browser scrolls
 * the visual viewport to keep the focused field visible, height alone
 * under-reports and the bar drifts.
 *
 * Both `resize` and `scroll` fire, and both fire in bursts — so the state is
 * written at most once per frame. Reading layout on every raw event is how a
 * mid-range phone drops frames while somebody is typing.
 *
 * iOS Safari also shrinks the visual viewport, so the same arithmetic holds
 * there. Desktop browsers never produce a non-zero inset, which is why callers
 * can apply this unconditionally — and why the two callers respond to it in
 * OPPOSITE directions (the raise form's bar rides up; the workspace's bar gets
 * out of the way). Same measurement, different answer, because only one of the
 * two is the thing the thumb is reaching for.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = React.useState(0);

  React.useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      const covered = window.innerHeight - (vv.height + vv.offsetTop);
      // Sub-pixel noise and browser-chrome animations produce small values
      // that are not a keyboard. Anything under 80px is treated as none.
      const next = covered > 80 ? Math.round(covered) : 0;
      setInset((prev) => (prev === next ? prev : next));
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
    };
  }, []);

  return inset;
}
