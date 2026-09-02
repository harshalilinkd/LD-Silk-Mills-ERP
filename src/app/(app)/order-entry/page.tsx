import { Suspense } from "react";

import { dashboardParams, loadDashboard } from "@/lib/order-entry/dashboard-query";
import { presetRange, type DateRangePreset } from "@/lib/order-entry/dashboard";
import { DashboardView } from "@/components/order-entry/dashboard/dashboard-view";

// Thin Server Component: resolve the range from the URL, run the (already
// complete) dashboard query on the server, hand the payload to the client view.
// Changing the range is a normal navigation, so the query re-runs here rather
// than in the browser.
type SP = Record<string, string | undefined>;

// The presets src/lib/order-entry/dashboard.ts knows how to resolve. "custom"
// is not one of them — it is what an explicit from/to pair means.
const PRESET_KEYS = new Set<DateRangePreset>(["today", "7d", "30d", "month"]);

function isPreset(value: string | undefined): value is DateRangePreset {
  return value !== undefined && PRESET_KEYS.has(value as DateRangePreset);
}

export default async function OrderEntryDashboardPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  // URL contract (mirrored by src/components/order-entry/dashboard/use-range-nav):
  //   ?preset=today|7d|30d|month → presetRange(preset, today), from/to ignored
  //   ?from=&to=                 → an explicit range, validated by dashboardParams
  //   neither                    → dashboardParams' own default: the last 30 days
  const today = new Date().toISOString().slice(0, 10);
  const range = isPreset(sp.preset)
    ? presetRange(sp.preset, today)
    : { from: sp.from, to: sp.to };

  const params = dashboardParams({
    from: range.from,
    to: range.to,
    department: sp.department,
  });
  const data = await loadDashboard(params);

  return (
    // The filter bar reads useSearchParams(); the boundary keeps that legal no
    // matter how Next decides to render this route.
    <Suspense fallback={null}>
      <DashboardView
        data={data}
        today={today}
        department={params.department}
      />
    </Suspense>
  );
}
