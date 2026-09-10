"use client";

import * as React from "react";

/**
 * Give a table exactly the height that is left, so the PAGE never scrolls too.
 *
 * ── THE BUG THIS EXISTS TO PREVENT ────────────────────────────────────────
 *
 * Both order tables used to cap their body with a hand-written guess —
 * `70vh` on one, `calc(100vh-19rem)` on the other. A guess cannot know how
 * tall the page header, the five summary cards, the search bar (which wraps)
 * and the filter panel (which opens) actually came out, so it was always a
 * little wrong — and "a little wrong" means the page gets a scrollbar of its
 * own on top of the table's.
 *
 * Two scrollbars that never finish together is the thing the owner reported:
 * "maine table ke last me hu but page scroll bar bich me atka hai". Measured
 * on the board at the time, the page had 150px of its own scroll and the
 * table 356px of its own.
 *
 * ── EVERYTHING HERE IS MEASURED, NOT RESERVED ────────────────────────────
 *
 *   · The scroll container is <main>, not the window. In this shell the
 *     window never scrolls at all, so measuring against `innerHeight` gives
 *     the wrong answer whenever the topbar is on screen.
 *   · What sits BELOW the card is measured, because the pagination strip only
 *     renders when there is more than one page. A constant would leave a dead
 *     band on every single-page result and overflow by its own height on the
 *     rest.
 *   · The card's own chrome — its border and the horizontal scrollbar these
 *     wide tables always have — is measured too. The cap goes on the
 *     scrolling BODY, but what has to fit is the CARD, and that difference
 *     was the last 12px on the board.
 *
 * ── AND IT RE-RUNS WHEN THE TABLE APPEARS ────────────────────────────────
 *
 * `deps` exists for one reason: the card DOES NOT EXIST while the first page
 * is loading. An effect that ran once ran before there was anything to
 * measure, bailed out and never came back — which left the table uncapped and
 * the PAGE scrolling instead. Pass whatever changes when the rows arrive.
 */
export function useFillHeight(deps: React.DependencyList = []) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = React.useState<number | null>(null);

  React.useLayoutEffect(() => {
    const card = ref.current;
    const scroller = card?.closest("main");
    if (!card || !scroller) return;

    const fit = () => {
      const sRect = scroller.getBoundingClientRect();
      const cRect = card.getBoundingClientRect();
      // Where the card starts, in the scroller's own content coordinates.
      const top = cRect.top - sRect.top + scroller.scrollTop;
      // Climb to <main>'s direct child — the page's own column — rather than
      // trusting `parentElement`. One of these tables is wrapped in a reveal
      // animation and one is not, and the parent of a wrapped card ends at
      // the card, which would report nothing below it and hide the pagination
      // under the fold.
      let root: HTMLElement = card;
      while (root.parentElement && root.parentElement !== scroller) {
        root = root.parentElement;
      }
      const below = root.getBoundingClientRect().bottom - cRect.bottom;
      const padBottom =
        parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
      const body = card.querySelector<HTMLElement>(
        "[data-fill-body], .overflow-auto",
      );
      const chrome = body
        ? Math.max(0, Math.round(cRect.height - body.clientHeight))
        : 0;
      setMaxHeight(
        Math.max(240, scroller.clientHeight - top - below - padBottom - chrome),
      );
    };

    fit();
    // The toolbar changes height when the search wraps or the filters open,
    // which moves the card; the window changes it on resize.
    const ro = new ResizeObserver(fit);
    ro.observe(scroller);
    if (card.parentElement) ro.observe(card.parentElement);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, maxHeight };
}
