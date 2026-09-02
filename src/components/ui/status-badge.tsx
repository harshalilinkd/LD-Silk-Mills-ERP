// StatusBadge — docs/SCREENS.md §0.4
//
//   COMPLETED           → green
//   PARTIALLY COMPLETED → amber
//   PENDING             → grey
//   CANCELLED           → red
//
// Geometry is our design system's status pill (docs/DESIGN.md § Tables):
// 10.5px / 600, padding 3px 8px, radius 99px, tinted fill + solid hue text.
//
// The badge is the ONE cell that is never struck through on a cancelled row
// (§3.5) — the row is greyed out and the badge is what says why, so it has to
// stay legible.

import { cn } from "@/lib/utils";

export type OperationsStatus =
  | "COMPLETED"
  | "PARTIALLY COMPLETED"
  | "PENDING"
  | "CANCELLED";

const TONES: Record<OperationsStatus, string> = {
  COMPLETED: "bg-status-green-dim text-status-green",
  "PARTIALLY COMPLETED": "bg-status-amber-dim text-status-amber",
  // Grey, not a hue: "pending" is the absence of progress, and giving it a
  // colour puts it in competition with the two statuses that mean something.
  PENDING: "bg-chip text-text-3",
  CANCELLED: "bg-status-red-dim text-status-red",
};

/** Normalises whatever the API returned; anything unknown reads as PENDING. */
export function asOperationsStatus(value: string | null | undefined) {
  const key = String(value ?? "").toUpperCase();
  return (key in TONES ? key : "PENDING") as OperationsStatus;
}

export function StatusBadge({
  status,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  status: string | null | undefined;
}) {
  const key = asOperationsStatus(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2 py-[3px] text-[10.5px] leading-none font-semibold whitespace-nowrap",
        TONES[key],
        className,
      )}
      {...props}
    >
      {key}
    </span>
  );
}
