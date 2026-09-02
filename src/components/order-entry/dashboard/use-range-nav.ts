"use client";

// The one place the dashboard's date-range URL contract is written. The filter
// bar and the monthly report table both change the range, and both must agree
// on the shape of the query string the Server Component reads back:
//
//   ?preset=today|7d|30d|month   → server resolves via presetRange(preset, today)
//   ?from=YYYY-MM-DD&to=…        → an explicit range (custom dates / one month)
//   (neither)                    → dashboardParams({}) → last 30 days
//
// `preset` and `from`/`to` are mutually exclusive: setting either clears the
// other, so the URL can never describe two different ranges at once. Any other
// query params already on the URL are preserved.
import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { DateRangePreset } from "@/lib/order-entry/dashboard";

export type RangePreset = Exclude<DateRangePreset, "custom">;

export type RangeTarget =
  | { preset: RangePreset }
  | { from?: string; to?: string };

export function useRangeNav(current: { from: string; to: string }): {
  apply: (target: RangeTarget) => void;
  pending: boolean;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const { from, to } = current;

  const apply = useCallback(
    (target: RangeTarget) => {
      const params = new URLSearchParams(searchParams.toString());
      if ("preset" in target) {
        params.set("preset", target.preset);
        params.delete("from");
        params.delete("to");
      } else {
        params.delete("preset");
        params.set("from", target.from ?? from);
        params.set("to", target.to ?? to);
      }
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [router, pathname, searchParams, from, to],
  );

  return { apply, pending };
}
