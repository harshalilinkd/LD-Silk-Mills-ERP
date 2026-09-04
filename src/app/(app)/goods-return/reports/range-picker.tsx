"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconCalendar, IconX } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The date range every report reads from.
 *
 * A popover behind an icon button in the page header, which is where
 * docs/DESIGN.md puts a rare, secondary date filter — not two date inputs
 * sitting permanently in a toolbar. It is opened occasionally and would
 * otherwise cost a row above the fold on every visit.
 *
 * The presets are the ranges somebody actually asks for. "This financial year"
 * runs April to March, because that is the year this business closes its books
 * on and a January-to-December default would quietly answer a different
 * question from the one asked.
 */
function fy(now: Date) {
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { from: `${y}-04-01`, to: `${y + 1}-03-31`, label: `FY ${y}–${String(y + 1).slice(2)}` };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function RangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = React.useState(false);

  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const active = Boolean(from || to);

  const apply = (next: { from?: string | null; to?: string | null }) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    router.push(`${pathname}?${q.toString()}`, { scroll: false });
  };

  // `new Date()` at render time is fine here: this is a client component, so
  // there is no server/client mismatch to hydrate wrong.
  const now = new Date();
  const thisYear = fy(now);
  const presets = [
    {
      label: "Last 30 days",
      from: iso(new Date(now.getTime() - 29 * 864e5)),
      to: iso(now),
    },
    {
      label: "Last 90 days",
      from: iso(new Date(now.getTime() - 89 * 864e5)),
      to: iso(now),
    },
    { label: thisYear.label, from: thisYear.from, to: thisYear.to },
  ];

  const field =
    "h-9 w-full rounded-field border border-border bg-surface px-2.5 text-[12.5px] text-text-1 outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40 num";

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="h-9"
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
      >
        <IconCalendar className="size-4" />
        {active ? (
          <span className="num">
            {from || "start"} → {to || "today"}
          </span>
        ) : (
          "All time"
        )}
        {active && <span className="ml-1 size-1.5 rounded-full bg-primary" />}
      </Button>

      {open && (
        <>
          {/* Click-away, and it is a real button so Escape and a tap both
              close it — a bare div here would trap keyboard users. */}
          <button
            type="button"
            aria-label="Close date range"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              "absolute right-0 z-40 mt-2 flex w-[290px] flex-col gap-3",
              "rounded-card border border-border bg-surface p-3 shadow-lg",
            )}
          >
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    apply({ from: p.from, to: p.to });
                    setOpen(false);
                  }}
                  className="cursor-pointer rounded-pill bg-chip px-2.5 py-1 text-[11.5px] font-medium text-text-2 transition-colors hover:bg-chip-strong hover:text-text-1"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[11px] font-medium text-text-2">
                From
                <input
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => apply({ from: e.target.value || null })}
                  className={field}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium text-text-2">
                To
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => apply({ to: e.target.value || null })}
                  className={field}
                />
              </label>
            </div>

            {active && (
              <button
                type="button"
                onClick={() => {
                  apply({ from: null, to: null });
                  setOpen(false);
                }}
                className="inline-flex cursor-pointer items-center gap-1 self-start text-[12px] font-semibold text-accent-text underline underline-offset-2"
              >
                <IconX className="size-3.5" /> Clear range
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
