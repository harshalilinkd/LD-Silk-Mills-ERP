import { Skeleton } from "@/components/ui/skeleton";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  What you look at while the server is working
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * There were ZERO `loading.tsx` files across 44 routes. Without one, Next has
 * nothing to show between "you clicked a link" and "the server finished", so
 * the browser sits on the PREVIOUS page, frozen, with no acknowledgement that
 * anything happened. On a warm server that is 30-200ms and merely feels
 * sticky; on a cold one it is two seconds of a screen that appears to have
 * ignored the click, which is the single worst thing a fast app can do.
 *
 * This file is why the app now responds instantly to every navigation. It does
 * not make the server faster — it stops the wait being invisible.
 *
 * ── WHY ONE FILE COVERS EVERYTHING ────────────────────────────────────────
 *
 * It sits at the `(app)` group root, so it is the fallback for every route
 * nested under it. Crucially the LAYOUT is not part of the fallback: the
 * sidebar, the topbar and your place in the navigation stay on screen and
 * stay interactive, and only the content region swaps. You can start moving
 * somewhere else before this page has finished arriving.
 *
 * ── WHY THIS SHAPE ────────────────────────────────────────────────────────
 *
 * A generic page: a heading, a row of figures, a block of content. It is
 * deliberately NOT a spinner. A spinner says "wait"; a shape that matches
 * where the content is about to land lets the eye settle before the data
 * arrives, and the page stops jumping when it does. It is also deliberately
 * not tuned to one screen — this is the fallback for 44 of them, and a
 * skeleton that mimics the orders table would be a lie on Settings.
 *
 * `animate-pulse` comes from the shared Skeleton, which Tailwind stops under
 * `prefers-reduced-motion`.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      {/* The one thing screen readers get. Everything below is decoration and
          is hidden from them — announcing sixteen grey rectangles is worse
          than announcing nothing. */}
      <span className="sr-only">Loading…</span>

      <div aria-hidden className="flex flex-col gap-4">
        {/* heading */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-[220px]" />
          <Skeleton className="h-4 w-[320px] max-w-full" />
        </div>

        {/* the figure row most screens open with */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4"
            >
              <Skeleton className="size-7 rounded-[9px]" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-3 w-full max-w-[140px]" />
            </div>
          ))}
        </div>

        {/* the body */}
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-[160px]" />
            <Skeleton className="h-8 w-[110px] rounded-field" />
          </div>
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="hidden h-4 w-24 sm:block" />
                <Skeleton className="h-6 w-16 shrink-0 rounded-pill" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
