"use client";

import * as React from "react";
import type { Icon } from "@tabler/icons-react";

import { Sparkline } from "@/components/help-slip/charts";
import { T } from "@/components/help-slip/type-scale";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Why this is not `@/components/ui/stat-card`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `StatCard` is this repo's KPI tile and both Orders and CRM share it: a 19px
 * figure, a 36px tinted icon square, five tones (accent / success / warning /
 * danger / neutral).
 *
 * ── THE GEOMETRY IS NOW STATCARD'S, TO THE PIXEL ──────────────────────────
 * An untinted `bg-surface` card at `p-2.5` with `shadow-sm`, the tone on a
 * 36px `rounded-lg` icon square rather than on the card, a 19px figure, and
 * `border-primary ring-2 ring-ring/25` when selected. The old card was a
 * tinted block with a 30px number, which is the single loudest reason this
 * module read as a different application. Order Entry tints an icon tile; it
 * never tints a whole card.
 *
 * What is left keeping this local is three props StatCard does not have and
 * should not grow: a bilingual label, an optional real `series` sparkline, and
 * the `overdue` emphasis that recolours the figure. (The `display`-size figure
 * used to be a fourth; it is a 19px StatCard figure now.) Two of them would
 * also need new tones, and widening a component two other modules render on
 * every screen for a third module's props is how a shared primitive stops
 * being shared.
 *
 * So: a module-local card that behaves exactly like StatCard where it matters
 * — with `onClick` it is a REAL <button> with `aria-pressed`, in the tab order
 * and responding to Enter and Space, because every one of these cells is a
 * filter and a keyboard user has to be able to reach it.
 *
 * ── THE TONES ARE CATEGORIES, NOT STATUSES ────────────────────────────────
 * The order violet / blue / amber / green is fixed and meaningless on purpose:
 * it SEPARATES the measures, it does not rank them. `overdue` is the one
 * exception and borrows the status palette, because overdue really is a state.
 *
 * ── WHAT IS STILL FORBIDDEN ───────────────────────────────────────────────
 * A gradient on a card, a figure above `display` size, and an axis, legend or
 * tooltip on the sparkline. If a chart needs a legend it is a report, and a
 * report is a different screen.
 */

const TONE = {
  violet: {
    tint: "bg-status-purple-dim",
    text: "text-status-purple",
    ink: "var(--status-purple)",
  },
  blue: {
    tint: "bg-status-blue-dim",
    text: "text-status-blue",
    ink: "var(--status-blue)",
  },
  amber: {
    tint: "bg-status-amber-dim",
    text: "text-status-amber",
    ink: "var(--status-amber)",
  },
  green: {
    tint: "bg-status-green-dim",
    text: "text-status-green",
    ink: "var(--status-green)",
  },
  overdue: {
    tint: "bg-status-red-dim",
    text: "text-status-red",
    ink: "var(--status-red)",
  },
} as const;

export type KpiTone = keyof typeof TONE;

export type Kpi = {
  key: string;
  labelEn: string;
  labelHi?: string;
  value: number;
  icon?: Icon;
  /** Defaults to violet. `overdue` borrows the status palette — see above. */
  tone?: KpiTone;
  /** Oldest first. Omit and the card simply has no line. */
  series?: number[];
  /** Renders the figure itself in the overdue tone. Overdue only. */
  emphasis?: "overdue";
};

export type KpiStripProps = {
  items: Kpi[];
  activeKey?: string | null;
  onSelect?: (key: string) => void;
  loading?: boolean;
  /**
   * The aggregate behind this strip failed to load. Every card says so
   * instead of printing its number — a confident zero on a failed fetch is a
   * card lying about somebody's workload, which is worse than an empty one.
   */
  error?: boolean;
  errorLabel?: string;
  className?: string;
};

export function KpiStrip({
  items,
  activeKey,
  onSelect,
  loading,
  error,
  errorLabel = "Failed to load",
  className,
}: KpiStripProps) {
  return (
    <div
      className={cn(
        // Scrolls horizontally below 768 rather than wrapping: five cells in a
        // grid at 360px gives 72px each, which is not enough for a bilingual
        // label. The last card peeking IS the scroll hint — never a scrollbar.
        "flex gap-2.5 overflow-x-auto pb-1 md:grid md:overflow-visible md:pb-0",
        items.length === 5 ? "md:grid-cols-5" : "md:grid-cols-4",
        className,
      )}
    >
      {items.map((item) => (
        <KpiCard
          key={item.key}
          item={item}
          active={activeKey === item.key}
          // `aria-pressed` only where a cell really is a TOGGLE. The
          // coordinator's cells filter the queue in place and stay pressed;
          // the employee's navigate to a filtered list and are gone the moment
          // they are used, so announcing "not pressed" on every one of them
          // describes a state they do not have.
          toggle={activeKey !== undefined}
          onSelect={onSelect}
          loading={loading}
          error={error}
          errorLabel={errorLabel}
        />
      ))}
    </div>
  );
}

function KpiCard({
  item,
  active,
  toggle,
  onSelect,
  loading,
  error,
  errorLabel,
}: {
  item: Kpi;
  active: boolean;
  toggle: boolean;
  onSelect?: (key: string) => void;
  loading?: boolean;
  error?: boolean;
  errorLabel: string;
}) {
  const overdue = item.emphasis === "overdue";
  const tone = TONE[item.tone ?? (overdue ? "overdue" : "violet")];
  const interactive = typeof onSelect === "function";
  const Glyph = item.icon;

  const body = (
    <>
      {/* LABEL FIRST, then the number.
          Drawn icon → number → label, a card reads in the order it was PAINTED
          rather than the order it is understood: you meet a tinted square and a
          bare figure before being told what either one means. Naming the
          measure first costs nothing and the number lands already understood. */}
      <div className="flex items-start justify-between gap-2">
        {/* StatCard's label is `text-[11px] font-medium`. The size is held at
            12.5 here and only the weight is adopted: the Hindi gloss renders
            at 0.85em, so an 11px label would set its own translation under
            10px, which is below the floor `.hi` exists to protect. */}
        <span className={cn("deva block min-w-0 font-medium text-text-2", T.bodySm)}>
          {item.labelEn}
          {item.labelHi ? (
            <span className="deva hi"> ({item.labelHi})</span>
          ) : null}
        </span>
        {Glyph ? (
          // The ERP's tinted square (ui/stat-card.tsx): the tone lives here,
          // not on the card. Order Entry never tints a whole card.
          //
          // Deliberately NOT `hidden sm:grid` the way StatCard's is: once the
          // card is untinted this tile is the only thing carrying the tone,
          // and on a phone these cards are also the filters.
          <span
            aria-hidden
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg",
              tone.tint,
              tone.text,
            )}
          >
            <Glyph className="size-[17px]" stroke={1.6} />
          </span>
        ) : null}
      </div>

      {/* The figure and its shape on ONE row. Stacked, they leave a card twice
          as tall as its content for a single digit — which is what makes a row
          of zeroes look like an empty page. */}
      <div className="mt-1.5 flex items-end justify-between gap-2">
        {loading ? (
          <Skeleton className="h-6 w-12" />
        ) : error ? (
          <span role="alert" className={cn("font-semibold text-status-red", T.bodySm)}>
            {errorLabel}
          </span>
        ) : (
          <span
            className={cn(
              "num block leading-tight",
              T.display,
              overdue ? "text-status-red" : "text-text-1",
            )}
          >
            {item.value}
          </span>
        )}

        {/* Hidden while loading OR errored: a line drawn from an empty set
            changes shape the moment real data lands, which is the layout shift
            the skeleton exists to prevent — and a line under an error notice
            would look like data. */}
        {!loading && !error && item.series ? (
          <Sparkline values={item.series} color={tone.ink} className="shrink-0" />
        ) : null}
      </div>
    </>
  );

  // ui/stat-card.tsx's shell, to the pixel: bg-surface (never a tinted card —
  // Order Entry tints an icon tile, never a whole card), p-2.5, shadow-sm,
  // border-primary + ring-2 ring-ring/25 when selected. The tone now lives on
  // the icon tile above, which is where the ERP puts it.
  const shell = cn(
    "relative min-w-40 shrink-0 overflow-hidden rounded-card border bg-surface p-2.5 text-left shadow-sm transition-colors md:min-w-0",
    // Selected is a UI state, not a measure, so it stays a ring and a border
    // rather than another wash of colour.
    active ? "border-primary ring-2 ring-ring/25" : "border-border hover:border-border-strong",
    interactive && "cursor-pointer outline-none",
    interactive &&
      "focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40",
  );

  if (!interactive) {
    return <div className={shell}>{body}</div>;
  }

  return (
    <button
      type="button"
      aria-pressed={toggle ? active : undefined}
      onClick={() => onSelect?.(item.key)}
      onKeyDown={(e) => {
        // A native <button> already fires click on Enter/Space; stating it
        // makes the contract explicit and survives the element being swapped.
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          onSelect?.(item.key);
        }
      }}
      className={shell}
    >
      {body}
    </button>
  );
}
