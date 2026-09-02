"use client";

import * as React from "react";
import { IconFilter } from "@tabler/icons-react";

import { Bi } from "@/components/help-slip/bilingual";
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
import { PRIORITY_META, STATUS_META, type HelpSlipLocale } from "@/lib/help-slip/meta";
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
  locale,
  className,
}: {
  value: ConcernStatus[];
  onChange: (next: ConcernStatus[]) => void;
  locale: HelpSlipLocale;
  className?: string;
}) {
  const toggle = (s: ConcernStatus) =>
    onChange(
      value.includes(s) ? value.filter((x) => x !== s) : [...value, s],
    );

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
              "deva inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-pill border px-3 transition-colors outline-none",
              T.bodySm,
              "focus-visible:ring-3 focus-visible:ring-ring/40",
              on
                ? "border-primary bg-accent text-accent-text"
                : "border-border bg-surface text-text-2 hover:border-border-strong hover:text-text-1",
            )}
          >
            <Glyph className="size-4 shrink-0" stroke={1.6} aria-hidden />
            {locale === "hi" ? meta.labelHi : meta.labelEn}
          </button>
        );
      })}
    </div>
  );
}

// ─── native selects ────────────────────────────────────────────────────────

export type SelectOption = { value: string; label: string; labelHi?: string };

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
  locale,
  className,
}: {
  ariaLabel: string;
  value: string;
  onChange: (next: string) => void;
  options: SelectOption[];
  locale: HelpSlipLocale;
  className?: string;
}) {
  const active = value !== "";
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "deva h-11 max-w-full cursor-pointer rounded-field border px-3 transition-colors outline-none",
        T.bodySm,
        "focus-visible:ring-3 focus-visible:ring-ring/40",
        active
          ? "border-primary bg-accent text-accent-text"
          : "border-border bg-surface text-text-2 hover:border-border-strong",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {locale === "hi" && o.labelHi ? o.labelHi : o.label}
        </option>
      ))}
    </select>
  );
}

export function departmentOptions(
  departments: DepartmentOption[],
  anyLabel: string,
): SelectOption[] {
  return [
    { value: "", label: anyLabel },
    ...departments.map((d) => ({
      value: d.id,
      label: d.name,
      labelHi: d.nameHi ?? undefined,
    })),
  ];
}

export function priorityOptions(
  anyLabel: string,
  locale: HelpSlipLocale,
): SelectOption[] {
  return [
    { value: "", label: anyLabel },
    ...ALL_PRIORITIES.map((p) => ({
      value: p,
      label:
        locale === "hi" ? PRIORITY_META[p].labelHi : PRIORITY_META[p].labelEn,
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
        className={cn(CONTROL, "num w-40")}
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
        className={cn(CONTROL, "num w-40")}
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
        <Bi en="Filters" hi="फ़िल्टर" />
        {activeCount > 0 ? (
          <span className="num ml-1 rounded-pill bg-accent px-1.5 py-px text-[11px] font-semibold text-accent-text">
            {activeCount}
          </span>
        ) : null}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] overflow-y-auto rounded-t-card"
        >
          <SheetHeader>
            <SheetTitle className={cn("deva", T.h3)}>
              <Bi en="Filters" hi="फ़िल्टर" />
            </SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-5 px-4">{children}</div>

          <SheetFooter className="flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onReset}
              className="h-11 flex-1"
            >
              <Bi en="Reset" hi="रीसेट करें" />
            </Button>
            <Button
              type="button"
              onClick={() => {
                onApply();
                setOpen(false);
              }}
              className="h-11 flex-1"
            >
              <Bi en="Apply" hi="लागू करें" />
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
  labelHi,
  children,
}: {
  labelEn: string;
  labelHi?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className={cn("deva mb-2 text-text-1", T.label)}>
        <Bi en={labelEn} hi={labelHi} />
      </legend>
      {children}
    </fieldset>
  );
}

/** Checkbox rows for the sheet, where pills would wrap to four lines. */
export function CheckRow({
  checked,
  onToggle,
  labelEn,
  labelHi,
}: {
  checked: boolean;
  onToggle: () => void;
  labelEn: string;
  labelHi?: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="size-[17px] shrink-0 accent-[var(--primary)]"
      />
      <span className={cn("deva text-text-1", T.bodySm)}>
        <Bi en={labelEn} hi={labelHi} />
      </span>
    </label>
  );
}

export { ALL_PRIORITIES, ALL_STATUSES };
