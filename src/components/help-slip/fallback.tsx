import { Skeleton } from "@/components/ui/skeleton";

/**
 * The Suspense fallback for a Help Slip screen.
 *
 * Box-for-box the shape of what lands: a header, a KPI row, a panel. A
 * skeleton of the wrong height causes exactly the layout shift it exists to
 * prevent — which is why this is not a centred spinner.
 */
export function DashboardFallback() {
  return (
    <div className="flex flex-col gap-10" aria-busy role="status">
      <span className="sr-only">Loading</span>
      <div className="flex flex-col gap-2 py-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-80" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[124px] rounded-card" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-card" />
    </div>
  );
}

/** The list screens: a header, a toolbar row, then the table. */
export function ListFallback() {
  return (
    <div className="flex flex-col gap-10" aria-busy role="status">
      <span className="sr-only">Loading</span>
      <div className="flex flex-col gap-2 py-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-5 w-72" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-11 w-72 rounded-field" />
        <Skeleton className="h-11 w-40 rounded-field" />
      </div>
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}
