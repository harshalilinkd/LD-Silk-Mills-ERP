"use client";

// OrderFilters — docs/SCREENS.md §3.4
//
// The shared filter panel. Used by the Orders table, the Tracking view (§4B.2)
// and Operations. The Order-status board builds its own row by hand (it needs
// Party/Fabric/Stage selects this panel does not have) but still imports
// `OrderFilterState` and `appendOrderFilterParams` from here, so the query
// params are identical whichever screen built them. That is the point of this
// module: one definition of what an order filter IS.
//
// ── Month is not a filter ────────────────────────────────────────────────
// It is a shortcut that WRITES the date range. Choosing one calls
// `set(monthRange(key))`; the select's own value is derived back out of the
// dates by `monthOfRange(from, to)`. The two therefore cannot disagree, and a
// hand-typed range that happens to be a whole month displays as that month.
// *All months* clears both dates.
//
// ── It fires on every keystroke ──────────────────────────────────────────
// The panel never debounces. Each screen debounces before querying (300ms on
// Orders, 200ms on the tracker) — see useDebouncedValue. Keeping the debounce
// in the screen lets the screen react instantly in the UI (the "filters
// active" dot, the reset to page 1) while delaying only the request.

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  monthLabel,
  monthOfRange,
  monthRange,
  type MonthKey,
} from "@/lib/order-entry/months";
import { Autocomplete } from "@/components/order-entry/orders/autocomplete";
import { useLookup } from "@/components/order-entry/orders/use-lookups";
import { cn } from "@/lib/utils";

// Re-exported so a screen only ever imports one module to build a query.
export { monthRange, monthOfRange, monthLabel, type MonthKey };

export type OrderFilterState = {
  order_no: string;
  challan_no: string;
  lot_no: string;
  /**
   * A fabric NAME, exactly as it is on the line — never a fragment.
   *
   * It is a select rather than a text box, and that is not a style choice:
   * the Tracking view's endpoint matches fabric with `eq`, so a typed "lio"
   * would find nothing there while finding LIO LINEN on the Orders table.
   * One control cannot mean two things, so it only ever emits a real name.
   */
  fabric: string;
  haste: string;
  from: string;
  to: string;
};

export const EMPTY_ORDER_FILTERS: OrderFilterState = {
  order_no: "",
  challan_no: "",
  lot_no: "",
  fabric: "",
  haste: "",
  from: "",
  to: "",
};

/** True when anything in the panel is set — drives the toolbar's accent dot. */
export function hasActiveOrderFilters(f: OrderFilterState): boolean {
  return Object.values(f).some((v) => v.trim() !== "");
}

/**
 * Writes the filter state onto a URLSearchParams. Empty values are OMITTED
 * rather than sent blank: an `order_no=` in the query string is a filter for
 * the empty string on some read paths, and it also makes two identical
 * filter sets produce different TanStack Query keys.
 *
 * Note there is no `month` param — Month only ever reaches the server as
 * `from`/`to`.
 */
export function appendOrderFilterParams(
  params: URLSearchParams,
  f: OrderFilterState,
): URLSearchParams {
  const entries: [keyof OrderFilterState, string][] = [
    ["order_no", "order_no"],
    ["challan_no", "challan_no"],
    ["lot_no", "lot_no"],
    // The Order-status BOARD sets `fabric` itself, from its own select. It
    // builds its row by hand and never renders this panel, so its copy of the
    // state keeps `fabric: ""` and this line writes nothing there — the two
    // cannot both set the param.
    ["fabric", "fabric"],
    ["haste", "haste"],
    ["from", "from"],
    ["to", "to"],
  ];
  for (const [key, param] of entries) {
    const value = f[key].trim();
    if (value) params.set(param, value);
  }
  return params;
}

export type MonthOption = {
  key: MonthKey;
  /** Orders in that month; rendered as `Aug 2026 (14)`. */
  count?: number;
};

/** Sentinel for "the dates are set but they are not a whole month". */
const CUSTOM = "__custom__";

const LABEL_CLASS = "text-[11px] font-medium text-text-2";
const FIELD_CLASS = "h-9 rounded-field text-sm";
// The select is styled by hand because there is no shared Select primitive in
// this module's vocabulary — the shadcn one is a popover, and this row needs a
// native <select> so it works inside the panel on a phone.
const SELECT_CLASS = cn(
  "h-9 w-full rounded-field border border-border-strong bg-surface px-2 text-sm text-text-1 outline-none",
  "focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/25",
);

/**
 * Type to search, but only ever commit a REAL fabric name.
 *
 * A plain `<select>` over 244 fabrics is a scroll, not a search — the owner's
 * words were "make it smart and dynamic like modern search as I type". The
 * order form's `Autocomplete` already does the searching part well (ranked so
 * a name STARTING with what you typed comes first, keyboard navigable), so it
 * does the work here and this only adds the one rule it deliberately does not
 * have: the value must exist.
 *
 * ── WHY IT CANNOT JUST BE FREE TEXT ──────────────────────────────────────
 *
 * Both endpoints match fabric EXACTLY, and they have to: 48 of the fabrics in
 * use are contained inside another one. `INDIANA` sits inside `INDIANA CHECKS`
 * and `INDIANA STRIPE`, `BARCODE` inside `BARCODE PLAIN`. Matching "contains"
 * would quietly fold three fabrics into one and report a number nobody could
 * tell was wrong. So typing narrows the LIST; only a name from that list
 * becomes the filter.
 *
 * Typing a full name by hand counts as picking it, case-insensitively, and
 * commits the canonical spelling. Anything else is a half-finished search:
 * on blur the box goes back to whatever the filter actually is, so it can
 * never sit showing text that is not what the table is filtered by.
 */
function FabricPicker({
  value,
  options,
  onChange,
  className,
}: {
  value: string;
  options: readonly string[];
  onChange: (next: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = React.useState(value);
  // The committed value, readable from inside the blur timeout without making
  // the timeout depend on a stale render.
  const committed = React.useRef(value);
  committed.current = value;

  React.useEffect(() => setDraft(value), [value]);

  const canonical = React.useCallback(
    (typed: string) =>
      options.find((o) => o.toLowerCase() === typed.trim().toLowerCase()) ?? null,
    [options],
  );

  return (
    <Autocomplete
      className={className}
      placeholder="All fabrics"
      aria-label="Fabric"
      value={draft}
      suggestions={options as string[]}
      onValueChange={(v) => {
        setDraft(v);
        // Empty clears the filter outright — that is how you get back to all
        // fabrics without hunting for a Clear.
        if (v.trim() === "") {
          onChange("");
          return;
        }
        const exact = canonical(v);
        if (exact) onChange(exact);
      }}
      onBlur={() => {
        // After the list's own 120ms grace, so a click on a suggestion has
        // already committed by the time this runs.
        window.setTimeout(() => setDraft(committed.current), 160);
      }}
    />
  );
}

export function OrderFilters({
  value,
  onChange,
  months = [],
  showClear = true,
  className,
}: {
  value: OrderFilterState;
  onChange: (next: OrderFilterState) => void;
  /** Every month in the order book, newest first. */
  months?: readonly MonthOption[];
  /** Suppress the Clear button on screens that render their own. */
  showClear?: boolean;
  className?: string;
}) {
  const set = React.useCallback(
    (patch: Partial<OrderFilterState>) => onChange({ ...value, ...patch }),
    [onChange, value],
  );

  // Derived, never stored. This is what makes the select and the dates
  // incapable of disagreeing.
  const derivedMonth = monthOfRange(value.from, value.to);
  const hasDates = Boolean(value.from || value.to);
  const monthValue = derivedMonth ?? (hasDates ? CUSTOM : "");

  // The real fabric list, so the control can only emit a name that exists.
  // `useLookup` is shared with the order form and the status board, so this
  // costs one cached request per session rather than one per screen.
  const fabrics = useLookup("FABRIC");

  const active = hasActiveOrderFilters(value);

  return (
    <div
      className={cn(
        "rounded-field border border-border bg-surface-2 p-3",
        className,
      )}
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Order no</span>
          <Input
            className={FIELD_CLASS}
            value={value.order_no}
            placeholder="—"
            onChange={(e) => set({ order_no: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Challan</span>
          <Input
            className={FIELD_CLASS}
            value={value.challan_no}
            placeholder="—"
            onChange={(e) => set({ challan_no: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Lot</span>
          <Input
            className={FIELD_CLASS}
            value={value.lot_no}
            placeholder="—"
            onChange={(e) => set({ lot_no: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Fabric</span>
          <FabricPicker
            className={FIELD_CLASS}
            value={value.fabric}
            /* A fabric that is the active filter but has since been switched
               off in Masters is kept in the list, or it would vanish from the
               suggestions while still narrowing the table. */
            options={
              value.fabric && !fabrics.includes(value.fabric)
                ? [value.fabric, ...fabrics]
                : fabrics
            }
            onChange={(fabric) => set({ fabric })}
          />
        </label>

        <label className="flex flex-col gap-1">
          {/* Haste is a COMPANY NAME here, not an urgency. */}
          <span className={LABEL_CLASS}>Haste</span>
          <Input
            className={FIELD_CLASS}
            value={value.haste}
            placeholder="—"
            onChange={(e) => set({ haste: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Month</span>
          <select
            className={SELECT_CLASS}
            value={monthValue}
            onChange={(e) => {
              const key = e.target.value;
              if (!key || key === CUSTOM) {
                // "All months" clears BOTH dates. Selecting the synthetic
                // custom option is a no-op — it only ever exists to display
                // a hand-typed range.
                if (!key) set({ from: "", to: "" });
                return;
              }
              set(monthRange(key));
            }}
          >
            <option value="">All months</option>
            {hasDates && !derivedMonth && (
              // The range in the boxes is not a whole month, so no option in
              // the list can represent it. Rather than showing a wrong month
              // (or an empty select that reads as "All months" while dates
              // are active), show it honestly.
              <option value={CUSTOM}>— none</option>
            )}
            {months.map((m) => (
              <option key={m.key} value={m.key}>
                {monthLabel(m.key)}
                {m.count == null ? "" : ` (${m.count})`}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>From</span>
          <Input
            type="date"
            className={cn(FIELD_CLASS, "num")}
            value={value.from}
            // Cross-bound: `from` can never be later than `to`, and the
            // browser's own picker enforces it before onChange ever fires.
            max={value.to || undefined}
            onChange={(e) => set({ from: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>To</span>
          <Input
            type="date"
            className={cn(FIELD_CLASS, "num")}
            value={value.to}
            min={value.from || undefined}
            onChange={(e) => set({ to: e.target.value })}
          />
        </label>
      </div>

      {showClear && active && (
        <div className="mt-2.5 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...EMPTY_ORDER_FILTERS })}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
