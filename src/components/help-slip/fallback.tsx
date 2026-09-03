import { Skeleton } from "@/components/ui/skeleton";

/**
 * The Suspense fallback for a Help Slip screen.
 *
 * Box-for-box the shape of what lands: a header, a KPI row, a panel. A
 * skeleton of the wrong height causes exactly the layout shift it exists to
 * prevent — which is why this is not a centred spinner, and why every height
 * below tracks the ERP scale the real screens now use (a 22px page title, a
 * 13px subtitle, a StatCard-geometry KPI card).
 */
export function DashboardFallback() {
  return (
    <div className="flex flex-col gap-4" aria-busy role="status">
      <span className="sr-only">Loading</span>
      {/* Mirrors PageHeader's own `pb-2`, and the title/subtitle heights below
          are LINE heights, not font sizes: both sit on `.deva`, whose
          line-height of 1.65 governs because Tailwind emits none for an
          arbitrary `text-[22px]`. Measuring the font instead left the skeleton
          12px short of the h1 and reintroduced the shift this exists to
          prevent. */}
      <div className="flex flex-col gap-1 pb-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-[21px] w-72" />
      </div>
      <div className="grid gap-2.5 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[78px] rounded-card" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-card" />
    </div>
  );
}

/** The list screens: a header, a toolbar row, then the table. */
export function ListFallback() {
  return (
    <div className="flex flex-col gap-4" aria-busy role="status">
      <span className="sr-only">Loading</span>
      {/* Mirrors PageHeader's own `pb-2`, and the title/subtitle heights below
          are LINE heights, not font sizes: both sit on `.deva`, whose
          line-height of 1.65 governs because Tailwind emits none for an
          arbitrary `text-[22px]`. Measuring the font instead left the skeleton
          12px short of the h1 and reintroduced the shift this exists to
          prevent. */}
      <div className="flex flex-col gap-1 pb-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-[21px] w-64" />
      </div>
      {/* The toolbar controls are 44px below md and 36px from md up (see
          CONTROL), so their placeholders step with them — a fixed height here
          reintroduces the shift on exactly one of the two breakpoints. */}
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-11 w-72 rounded-field md:h-9" />
        <Skeleton className="h-11 w-40 rounded-field md:h-9" />
      </div>
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}
