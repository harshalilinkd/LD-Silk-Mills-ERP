"use client";

// ColumnPicker — docs/SCREENS.md §4A.4
//
// A popover of checkboxes over the board's column list. Thirteen columns is
// more than most people want at once and the seven stage columns are the ones
// that push the table past the viewport, so switching a few off is the
// difference between a table that scrolls sideways and one that does not.
//
// The STATE lives in `useColumnPrefs` (components/order-entry/shared) — this
// file is only the control. That hook stores the HIDDEN ids (so a column
// added in a later release defaults to visible), gates persistence on a
// `loaded` flag (so hydration cannot clobber the saved set) and filters
// restored ids against the current list (so a removed column leaves no
// orphan). See its own header for the bug behind each.
//
// `locked` columns — the order number, the row's identity — are rendered and
// listed here but disabled: they can never be hidden.

import { IconCheck, IconColumns3, IconRestore } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ColumnDef } from "@/components/order-entry/shared/use-column-prefs";
import { cn } from "@/lib/utils";

export function ColumnPicker({
  columns,
  hidden,
  onToggle,
  onReset,
}: {
  columns: readonly ColumnDef[];
  /** The ids currently switched off — what `useColumnPrefs` persists. */
  hidden: Set<string>;
  onToggle: (id: string) => void;
  onReset: () => void;
}) {
  const hiddenCount = columns.filter(
    (c) => !c.locked && hidden.has(c.id),
  ).length;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label="Choose columns"
            title="Choose columns"
            className="relative shrink-0"
          />
        }
      >
        <IconColumns3 />
        {hiddenCount > 0 ? (
          // The count, not just a dot: "some columns are off" is only useful
          // if you can tell how many you are missing. `ring-2 ring-surface`
          // is what keeps it legible against the button's own edge.
          <span className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground ring-2 ring-surface">
            {hiddenCount}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-60 gap-0 p-1.5">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[11px] font-bold tracking-[0.04em] text-text-3 uppercase">
            Show columns
          </span>
          <button
            type="button"
            onClick={onReset}
            disabled={hiddenCount === 0}
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium text-text-2 transition-colors hover:text-text-1 disabled:pointer-events-none disabled:opacity-40"
          >
            <IconRestore className="size-3" /> Reset
          </button>
        </div>
        <div className="my-1 h-px bg-border" />
        <ul className="flex flex-col">
          {columns.map((c) => {
            const checked = !hidden.has(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  disabled={c.locked}
                  onClick={() => onToggle(c.id)}
                  className="flex w-full items-center gap-2.5 rounded-field px-2 py-1.5 text-left transition-colors hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border-strong bg-surface",
                    )}
                  >
                    {checked ? (
                      <IconCheck className="size-3" stroke={3} />
                    ) : null}
                  </span>
                  <span className="flex-1 text-[13px] text-text-1">
                    {c.label}
                  </span>
                  {c.locked ? (
                    <span className="text-[10px] text-text-3">Always</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
