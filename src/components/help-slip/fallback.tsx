import { Skeleton } from "@/components/ui/skeleton";

/**
 * The Suspense fallbacks for a Help Slip screen.
 *
 * Box-for-box the shape of what lands: the page root's `gap-5`, a header, a
 * KPI row, a carded toolbar, a panel. A skeleton of the wrong height causes
 * exactly the layout shift it exists to prevent — which is why this is not a
 * centred spinner.
 *
 * ── RE-MEASURED AFTER THE HINDI CAME OUT ──────────────────────────────────
 * Every text placeholder here is a LINE box, not a font size, and the line
 * box changed. These elements used to sit on `.deva`, whose `line-height:
 * 1.65` existed to stop Devanagari matras clipping; with no Hindi left, the
 * document's 1.5 governs (Tailwind emits no line-height for an arbitrary
 * `text-[22px]`). So:
 *
 *     h1        22px × 1.5 = 33px    (was 22 × 1.65 = 36.3 → h-9)
 *     subtitle  13px × 1.5 = 19.5px  (was 13 × 1.65 = 21.45 → h-[21px])
 *
 * The KPI tile is unaffected by that change and is measured from its own
 * geometry instead: `p-2.5` (10 + 10) + a 36px icon square + `mt-1.5` (6) +
 * a 28px sparkline row = 90px.
 */

/** The h1 line box. See the note above before changing it. */
const TITLE_H = "h-[33px]";
/** The subtitle line box. */
const SUBTITLE_H = "h-[19.5px]";

/** Header + KPI strip + a panel — the two dashboards. */
export function DashboardFallback() {
  return (
    <div className="flex flex-col gap-5" aria-busy role="status">
      <span className="sr-only">Loading</span>
      <div className="flex flex-col gap-1">
        <Skeleton className={`${TITLE_H} w-56`} />
        <Skeleton className={`${SUBTITLE_H} w-72`} />
      </div>
      {/* Mirrors KpiStrip exactly: a horizontal scroller below `md` (five
          cells in a grid at 360px gives 72px each, which is not a card) and a
          grid from `md` up. A grid here and a scroller there would shift the
          whole page at one breakpoint only, which is the hardest kind of
          shift to notice in review and the most obvious in use. */}
      <div className="flex gap-2.5 overflow-x-auto pb-1 md:grid md:grid-cols-4 md:overflow-visible md:pb-0">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton
            key={i}
            className="h-[90px] min-w-40 shrink-0 rounded-card md:min-w-0"
          />
        ))}
      </div>
      <Skeleton className="h-72 rounded-card" />
    </div>
  );
}

/** Header + a carded toolbar + the table panel — the list and detail screens. */
export function ListFallback() {
  return (
    <div className="flex flex-col gap-5" aria-busy role="status">
      <span className="sr-only">Loading</span>
      <div className="flex flex-col gap-1">
        <Skeleton className={`${TITLE_H} w-48`} />
        <Skeleton className={`${SUBTITLE_H} w-64`} />
      </div>
      {/* The toolbar is a card, not a bare row (a bare row of controls beside
          carded content is the "floating on the page background" tell). Its
          height is its own: `p-2.5` (10 + 10) around a control that is 44px
          below `md` and 36px from `md` up — 64px, then 56px. */}
      <Skeleton className="h-16 rounded-card md:h-14" />
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}
