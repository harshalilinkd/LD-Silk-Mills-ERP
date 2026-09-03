"use client";

import * as React from "react";
import { IconFilter } from "@tabler/icons-react";

import { CONTROL, T } from "@/components/help-slip/type-scale";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  CONCERN_STATUSES,
  type ConcernPriority,
  type ConcernStatus,
} from "@/db/help-slip/schema";
import { PRIORITY_META, STATUS_META } from "@/lib/help-slip/meta";
import type { DepartmentOption } from "@/lib/help-slip/types";
import { cn } from "@/lib/utils";

/**
 * The filter controls, written ONCE and rendered in two places: inline above
 * the table from 768, stacked inside a bottom sheet below it.
 *
 * One component, deliberately. A sheet and a toolbar maintained separately
 * drift within a month, and then the phone is missing the filter somebody
 * added for desktop last week — the same reasoning that makes each list one
 * component with two renderings rather than two components.
 *
 * ── WHAT DID NOT COME ACROSS ──────────────────────────────────────────────
 * The source ships a bespoke `DateRangePicker` — a popover on desktop, an
 * inline calendar in the sheet. These use two native `<input type="date">`
 * instead. Native is what the source's own PC dashboard uses for its insights
 * range, it is what a mid-range Android renders best (the OS date wheel beats
 * anything we would build and costs no JavaScript), and a two-month calendar
 * component is a screen's worth of work that this phase does not need. The
 * gap is cosmetic and it is noted rather than hidden.
 */

const ALL_STATUSES = CONCERN_STATUSES;
// Urgent first: a coordinator narrowing by priority almost always means "just
// Urgent" or "just High", so the two they want are the two they reach first.
const ALL_PRIORITIES: ConcernPriority[] = ["urgent", "high", "normal", "low"];

// ─── the two containers a filter row lives in ──────────────────────────────

/**
 * THE ERP TOOLBAR, as a class string: search, pills and selects sit INSIDE a
 * card. They do not float on the page ground.
 *
 * This is the module's loudest structural tell and the cheapest to fix. Four
 * of the six Order Entry list screens card their toolbar (§E.2 / §J.3), and
 * `ListFallback` already draws a carded toolbar skeleton — so a bare row here
 * would also mean the page changes shape the moment the data lands.
 *
 * `shadow-sm` and no `hover:` — the card is a container, not a press target.
 */
export const FILTER_TOOLBAR =
  "flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-2.5 shadow-sm";

/**
 * THE RECESSED WELL for a second, expandable row of filters.
 *
 * `rounded-field` + `bg-surface-2`, not a card: it lives INSIDE the toolbar
 * region rather than beside the cards, and a card within a card reads as two
 * things when it is one.
 */
export const FILTER_WELL =
  "rounded-field border border-border bg-surface-2 p-3";

// ─── status pills ──────────────────────────────────────────────────────────

/**
 * Multi-select, as pills carrying the status's own icon and label.
 *
 * Pills rather than a multi-select listbox: five options is few enough to show
 * all of them, and a control that shows its whole vocabulary needs no label
 * above it — which is what keeps this toolbar one row tall instead of two.
 */
export function StatusPills({
  value,
  onChange,
  className,
}: {
  value: ConcernStatus[];
  onChange: (next: ConcernStatus[]) => void;
  className?: string;
}) {
  const toggle = (s: ConcernStatus) =>
    onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]);

  return (
    <div
      role="group"
      aria-label="Status"
      className={cn("flex flex-wrap gap-2", className)}
    >
      {ALL_STATUSES.map((s) => {
        const meta = STATUS_META[s];
        const Glyph = meta.icon;
        const on = value.includes(s);
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(s)}
            className={cn(
              // 44px + 16px text below md: the minimum touch target for a
              // phone held on the factory floor, and the size the labels stay
              // readable at out there. ERP-compact from md up — ui/segmented's
              // md geometry (h-8 / px-3 / 13px), which is where the "this
              // module looks like a different app" complaint lives. Still an
              // `aria-pressed` MULTI-select, not a `Segmented` (that control is
              // single-select with a roving tabindex): only the geometry
              // converged, never the behaviour.
              "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-pill border px-3 text-base transition-colors outline-none md:h-8 md:px-3 md:text-[13px]",
              "focus-visible:ring-3 focus-visible:ring-ring/40",
              on
                ? "border-primary bg-accent text-accent-text"
                : "border-border bg-surface text-text-2 hover:border-border-strong hover:text-text-1",
            )}
          >
            <Glyph
              className="size-4 shrink-0 md:size-3.5"
              stroke={1.6}
              aria-hidden
            />
            {meta.labelEn}
          </button>
        );
      })}
    </div>
  );
}

// ─── native selects ────────────────────────────────────────────────────────

export type SelectOption = {
  value: string;
  label: string;
};

/**
 * A native `<select>` with its label in `aria-label` rather than above it.
 *
 * Still native — on a mid-range Android the OS wheel beats any listbox we
 * would build and costs no JavaScript. The label moves into `aria-label`
 * because a toolbar of stacked label+control pairs is two rows tall for one
 * row of controls, and the chosen value is visible, which is what the label
 * would have told you anyway.
 *
 * It goes brand-tinted when it holds a value, so a narrowed list says so
 * without a separate "filters active" badge.
 */
export function FilterSelect({
  ariaLabel,
  value,
  onChange,
  options,
  className,
}: {
  ariaLabel: string;
  value: string;
  onChange: (next: string) => void;
  options: SelectOption[];
  className?: string;
}) {
  const active = value !== "";
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        // 44px + 16px text below md: the minimum touch target for a phone held
        // on the factory floor, and anything under 16px makes iOS Safari
        // auto-zoom on focus — a `<select>` triggers that exactly as an
        // `<input>` does — and never zoom back out. ERP-compact (36px / 13px)
        // from md up: orders-dashboard's `h-9 … text-[13px]` toolbar select.
        "h-11 max-w-full cursor-pointer rounded-field border px-3 text-base transition-colors outline-none md:h-9 md:px-2.5 md:text-[13px]",
        "focus-visible:ring-3 focus-visible:ring-ring/40",
        active
          ? "border-primary bg-accent text-accent-text"
          : "border-border bg-surface text-text-2 hover:border-border-strong",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * A department prints `name`, and only `name`.
 *
 * `name_hi` is still on the row and the legacy Help Slip app still reads it.
 * This ERP does not, and it is never concatenated into a label here.
 */
export function departmentOptions(
  departments: DepartmentOption[],
  anyLabel: string,
): SelectOption[] {
  return [
    { value: "", label: anyLabel },
    ...departments.map((d) => ({ value: d.id, label: d.name })),
  ];
}

export function priorityOptions(anyLabel: string): SelectOption[] {
  return [
    { value: "", label: anyLabel },
    ...ALL_PRIORITIES.map((p) => ({
      value: p,
      label: PRIORITY_META[p].labelEn,
    })),
  ];
}

// ─── date range ────────────────────────────────────────────────────────────

/**
 * Two dates, INCLUSIVE at both ends.
 *
 * `max`/`min` cross-bound each other so the range cannot be inverted in the
 * UI at all, rather than being rejected after the fact — and the server
 * clamps regardless, because a URL can say anything.
 */
export function DateRangeFields({
  from,
  to,
  onChange,
  maxDate,
  labelFrom = "From date",
  labelTo = "To date",
  className,
}: {
  from: string | null;
  to: string | null;
  onChange: (next: { from: string | null; to: string | null }) => void;
  maxDate?: string;
  labelFrom?: string;
  labelTo?: string;
  className?: string;
}) {
  return (
    <span className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <input
        type="date"
        value={from ?? ""}
        max={to ?? maxDate}
        onChange={(e) => onChange({ from: e.target.value || null, to })}
        aria-label={labelFrom}
        className={cn(CONTROL, "num w-40 md:w-36")}
      />
      <span aria-hidden className="text-text-3">
        –
      </span>
      <input
        type="date"
        value={to ?? ""}
        min={from ?? undefined}
        max={maxDate}
        onChange={(e) => onChange({ from, to: e.target.value || null })}
        aria-label={labelTo}
        className={cn(CONTROL, "num w-40 md:w-36")}
      />
    </span>
  );
}

// ─── the mobile sheet ──────────────────────────────────────────────────────

/**
 * Below 768 the filters live in a bottom sheet: inline controls would eat the
 * vertical space the list needs.
 *
 * It edits a DRAFT and applies on Apply. A sheet that re-queried on every
 * checkbox would fire five requests while somebody made up their mind, and the
 * list behind it would flicker through five states nobody asked to see.
 *
 * The trigger states the COUNT of active filters. A filtered list that does
 * not say it is filtered is how somebody concludes their concern vanished.
 */
export function FilterSheet({
  activeCount,
  onOpen,
  onApply,
  onReset,
  children,
}: {
  activeCount: number;
  onOpen: () => void;
  onApply: () => void;
  onReset: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          onOpen();
          setOpen(true);
        }}
        className="h-11 shrink-0"
      >
        <IconFilter className="size-4" stroke={1.6} aria-hidden />
        Filters
        {activeCount > 0 ? (
          <span className="num ml-1 rounded-pill bg-accent px-1.5 py-px text-[11px] font-semibold text-accent-text">
            {activeCount}
          </span>
        ) : null}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] overflow-y-auto rounded-t-card"
        >
          <SheetHeader>
            <SheetTitle className={T.h3}>Filters</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4">{children}</div>

          <SheetFooter className="flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onReset}
              className="h-11 flex-1"
            >
              Reset
            </Button>
            <Button
              type="button"
              onClick={() => {
                onApply();
                setOpen(false);
              }}
              className="h-11 flex-1"
            >
              Apply
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** A labelled group inside the sheet. */
export function FilterGroup({
  labelEn,
  children,
}: {
  labelEn: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className={cn("mb-2 text-text-1", T.label)}>{labelEn}</legend>
      {children}
    </fieldset>
  );
}

/** Checkbox rows for the sheet, where pills would wrap to four lines. */
export function CheckRow({
  checked,
  onToggle,
  labelEn,
}: {
  checked: boolean;
  onToggle: () => void;
  labelEn: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="size-[17px] shrink-0 cursor-pointer rounded-[5px] accent-primary"
      />
      <span className={cn("text-text-1", T.body)}>{labelEn}</span>
    </label>
  );
}

export { ALL_PRIORITIES, ALL_STATUSES };
