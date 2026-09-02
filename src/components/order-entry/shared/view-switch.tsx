"use client";

// ViewSwitch — docs/SCREENS.md §3.1
//
// The pill segmented control that puts the Tracking view and the table behind
// one toggle. Both buttons carry `aria-pressed`; the second label is a prop,
// because Orders passes "Orders" and Order status passes "Board".
//
// Tracking is the default view on both screens (see useTrackView). When it sat
// behind the switch as the non-default, nobody found it — which was the entire
// problem it had been built to solve.

import { IconLayoutList, IconTable } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { TrackViewValue } from "./use-track-view";

export type { TrackViewValue };

export function ViewSwitch({
  value,
  onChange,
  /** "Orders" on the Orders screen, "Board" on Order status. */
  secondLabel = "Orders",
  className,
}: {
  value: TrackViewValue;
  onChange: (value: TrackViewValue) => void;
  secondLabel?: string;
  className?: string;
}) {
  const btn = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors outline-none [&_svg]:size-3.5",
      "focus-visible:ring-3 focus-visible:ring-ring/40",
      active
        ? // Spec `bg-accent text-white` → our accent FILL is --primary, whose
          // paired on-fill colour is --primary-foreground (never a literal
          // white: the teal fill is identical in both themes and white on it
          // fails contrast).
          "bg-primary text-primary-foreground"
        : "text-text-2 hover:text-text-1",
    );

  return (
    <div
      className={cn(
        "inline-flex shrink-0 gap-1 rounded-pill border border-border-strong bg-surface-2 p-0.5",
        className,
      )}
    >
      <button
        type="button"
        aria-pressed={value === "track"}
        onClick={() => onChange("track")}
        className={btn(value === "track")}
      >
        <IconLayoutList />
        Tracking
      </button>
      <button
        type="button"
        aria-pressed={value === "table"}
        onClick={() => onChange("table")}
        className={btn(value === "table")}
      >
        <IconTable />
        {secondLabel}
      </button>
    </div>
  );
}
