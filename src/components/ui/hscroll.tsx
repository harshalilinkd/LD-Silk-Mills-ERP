"use client";

// HScroll — docs/SCREENS.md §0.4
//
// A second horizontal scrollbar rendered ABOVE the header row and synced both
// ways with the body. Every wide table in the module uses it.
//
// Why it exists: these tables are 1,180–1,240px of columns inside a bounded
// body (`max-h-[70vh]`, `max-h-[calc(100vh-19rem)]`, or a measured pixel
// height from §4B). The browser's own horizontal scrollbar sits at the BOTTOM
// of that body — below 200 rows — so discovering that the table scrolls
// sideways required scrolling down first. The duplicate bar puts the control
// where the columns are.
//
// It is rendered ONLY when the content actually overflows, so a narrow table
// (or a wide viewport) does not grow a dead 12px strip above its header.

import * as React from "react";
import { cn } from "@/lib/utils";

export type HScrollProps = {
  children: React.ReactNode;
  /** Class names for the outer wrapper. */
  className?: string;
  /**
   * Class names for the scrolling body. This is where callers put the height
   * bound and the overflow, e.g. `"max-h-[70vh] overflow-auto"`.
   */
  bodyClassName?: string;
  /**
   * Inline styles for the scrolling body. §4B measures the card's
   * document-relative top and passes `{ maxHeight: bodyMax }` here, because a
   * `calc(100vh - Nrem)` cannot know how tall the wrapping toolbar came out.
   */
  bodyStyle?: React.CSSProperties;
};

// useLayoutEffect is right on the client — the first measurement must land
// before paint or the top bar flickers in — but it is a no-op on the server
// and React logs a warning for it. Client components are still server-rendered
// in the App Router, so swap it for useEffect there.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

export function HScroll({
  children,
  className,
  bodyClassName,
  bodyStyle,
}: HScrollProps) {
  const topRef = React.useRef<HTMLDivElement | null>(null);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);

  // The width the top bar's spacer must take for its scrollbar to have the
  // same range as the body's.
  const [contentWidth, setContentWidth] = React.useState(0);
  const [overflows, setOverflows] = React.useState(false);

  // Guards the two-way sync. Assigning `scrollLeft` fires a scroll event on
  // the other element, which would assign back — harmless in principle
  // (the value is already equal, so it settles) but sub-pixel rounding on
  // zoomed/HiDPI displays makes it oscillate. The flag ends it in one hop.
  const syncing = React.useRef(false);

  const measure = React.useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const scrollW = body.scrollWidth;
    const clientW = body.clientWidth;
    setContentWidth(scrollW);
    // 1px of slack: sub-pixel layout routinely reports scrollWidth a hair
    // over clientWidth on a table that does not actually overflow.
    setOverflows(scrollW - clientW > 1);
  }, []);

  useIsomorphicLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;

    measure();

    // Observe BOTH the body (its width changes when the sidebar collapses or
    // the window resizes) and its content (the table itself grows when a
    // column is switched on via ColumnPicker, or when rows with longer text
    // arrive). Watching only one of them misses half the cases.
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    const content = body.firstElementChild;
    if (content) ro.observe(content);

    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // Content can also change without any element resizing (same-width table,
  // different rows). Re-measure whenever the children identity changes.
  React.useEffect(() => {
    measure();
  }, [children, measure]);

  const sync = React.useCallback(
    (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
      if (!from || !to) return;
      if (syncing.current) {
        syncing.current = false;
        return;
      }
      if (Math.abs(to.scrollLeft - from.scrollLeft) < 1) return;
      syncing.current = true;
      to.scrollLeft = from.scrollLeft;
    },
    [],
  );

  return (
    <div className={cn("min-w-0", className)}>
      {overflows && (
        <div
          ref={topRef}
          onScroll={() => sync(topRef.current, bodyRef.current)}
          // aria-hidden + no tab stop: it is a duplicate control for the same
          // region, and a screen reader announcing an empty scroll area is
          // noise. Keyboard users scroll the body itself.
          aria-hidden
          className="h-3 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
        >
          <div style={{ width: contentWidth, height: 1 }} />
        </div>
      )}
      <div
        ref={bodyRef}
        onScroll={() => sync(bodyRef.current, topRef.current)}
        style={bodyStyle}
        className={cn("overflow-x-auto", bodyClassName)}
      >
        {children}
      </div>
    </div>
  );
}
