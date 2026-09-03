"use client";

import { useKeyboardInset } from "@/lib/help-slip/use-keyboard-inset";

/**
 * The submit bar, pinned above the keyboard. Phone only.
 *
 * Ported from the standalone app's
 * `src/features/concerns/components/StickySubmitBar.tsx`.
 *
 * `position: fixed; bottom: 0` alone DOES NOT WORK on Android Chrome. Fixed
 * resolves against the layout viewport, which does not shrink when the
 * keyboard opens — the keyboard is drawn on top of it. So the bar ends up
 * underneath the keyboard on the one screen where seeing the submit button is
 * the point.
 *
 * `useKeyboardInset()` measures the gap from `window.visualViewport` and this
 * translates by it. `transform` rather than `bottom`, because transform does
 * not trigger layout and this value changes while somebody is typing on a
 * mid-range phone.
 *
 * Two more things that are easy to leave out and obvious when missing:
 *
 *   - `env(safe-area-inset-bottom)` on the OUTER element — otherwise the
 *     button sits under the home indicator on gesture-nav Android and modern
 *     iPhones. The inner div carries the ordinary padding, so the two compose
 *     instead of one overwriting the other.
 *   - a spacer of the same height in the flow, or the bar covers the last
 *     field of the form and nothing can scroll past it.
 *
 * Below 768 only. Above that there is no software keyboard to dodge, the
 * shell's sidebar occupies the left 264px (so a full-bleed fixed bar would be
 * wrong anyway), and the submit button lives in the form itself.
 *
 * SURFACE, not the page ground: the ERP's sticky action bar is a translucent
 * `bg-surface/95` over a blur with a hairline top border, so the content
 * scrolling under it stays faintly visible and the bar still reads as a solid
 * object. `bg-background` made it the same colour as the gap between the
 * cards, which is the one thing a bar sitting ON the cards must not be.
 *
 * Whatever is passed in keeps a 44px touch target below `md` — this bar exists
 * only below `md`, so there is no compact variant to fall back to.
 */
export function StickySubmitBar({ children }: { children: React.ReactNode }) {
  const inset = useKeyboardInset();

  return (
    <>
      {/* Keeps the last field reachable above the bar. */}
      <div aria-hidden className="h-20 md:hidden" />

      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-[6px] md:hidden"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          transform: inset > 0 ? `translateY(-${inset}px)` : undefined,
          // No transition: the keyboard opens in one frame, and an animated
          // bar that arrives after it reads as lag rather than as polish.
        }}
      >
        <div className="px-4 py-3">{children}</div>
      </div>
    </>
  );
}

/** The same action, in the flow, for viewports with no keyboard to dodge. */
export function InlineSubmit({ children }: { children: React.ReactNode }) {
  return <div className="hidden md:block">{children}</div>;
}
