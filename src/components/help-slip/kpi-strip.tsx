"use client";

import * as React from "react";
import type { Icon } from "@tabler/icons-react";

import { Sparkline } from "@/components/help-slip/charts";
import { T } from "@/components/help-slip/type-scale";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard, type StatTone } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The KPI row. It IS `ui/stat-card.tsx` — this file only lays them out.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * It used to be a local copy of StatCard, on the argument that Help Slip needed
 * four things StatCard did not have. The copy matched StatCard's GEOMETRY —
 * p-2.5, a 36px tinted tile, a 19px figure — and then arranged those parts
 * differently: label left with the icon pushed to the right edge, figure on a
 * second row. Order Entry puts the icon FIRST and stacks label over figure
 * beside it. Two cards, same ingredients, visibly different objects, sitting
 * one sidebar entry apart. The user's words were "look at both dashboards
 * carefully ... KPI cards nothing matching correctly".
 *
 * So the four things moved into StatCard instead, as optional props no Orders
 * or CRM call site passes:
 *
 *   · `violet` / `info` tones — Help Slip's cells are CATEGORIES (New, In
 *     Progress, Waiting, Resolved), not a ranking. Painting two of them
 *     success/warning would claim Waiting is bad and Resolved is good about a
 *     workflow in which both are ordinary.
 *   · `valueTone` — Overdue recolours the FIGURE, not the tile. A red tile says
 *     "this cell is about lateness"; a red number says "this many are late
 *     right now". Only the second should shout.
 *   · `trailing` — where the sparkline goes.
 *   · `aria-pressed` only where a cell is really a toggle: the coordinator's
 *     cells filter the queue in place and stay pressed, while the employee's
 *     navigate away and are gone the moment they are used, so announcing "not
 *     pressed" on those describes a state they do not have. StatCard always
 *     sets it, so the non-toggle case renders a plain div here.
 *
 * ── STILL FORBIDDEN ───────────────────────────────────────────────────────
 * A gradient on a card, a figure above 19px, and an axis, legend or tooltip on
 * the sparkline. If a chart needs a legend it is a report, and a report is a
 * different screen.
 */

/** Categorical, not ranked — the order is fixed and deliberately meaningless. */
const TONE_INK: Record<KpiTone, string> = {
  violet: "var(--status-purple)",
  blue: "var(--status-blue)",
  amber: "var(--status-amber)",
  green: "var(--status-green)",
  overdue: "var(--status-red)",
};

/** Help Slip's vocabulary → StatCard's. */
const TONE_STAT: Record<KpiTone, StatTone> = {
  violet: "violet",
  blue: "info",
  amber: "warning",
  green: "success",
  overdue: "danger",
};

export type KpiTone = "violet" | "blue" | "amber" | "green" | "overdue";

export type Kpi = {
  key: string;
  labelEn: string;
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
        // grid at 360px gives 72px each, which is not a card. The last one
        // peeking IS the scroll hint — never a scrollbar.
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
  const kpiTone: KpiTone = item.tone ?? (overdue ? "overdue" : "violet");
  const Glyph = item.icon;

  const value = loading ? (
    <Skeleton className="h-5 w-10" />
  ) : error ? (
    <span
      role="alert"
      className={cn("font-semibold text-status-red", T.bodySm)}
    >
      {errorLabel}
    </span>
  ) : (
    item.value
  );

  return (
    <StatCard
      // `min-w-40 shrink-0` is the horizontal-scroll half of the strip above;
      // StatCard has no opinion about how it is laid out, which is the point.
      className="min-w-40 shrink-0 md:min-w-0"
      icon={Glyph ? <Glyph stroke={1.6} /> : undefined}
      label={item.labelEn}
      value={value}
      tone={TONE_STAT[kpiTone]}
      valueTone={overdue ? "danger" : undefined}
      trailing={
        // Hidden while loading OR errored: a line drawn from an empty set
        // changes shape the moment real data lands, which is the layout shift
        // the skeleton exists to prevent — and a line under an error notice
        // would look like data.
        !loading && !error && item.series ? (
          <Sparkline values={item.series} color={TONE_INK[kpiTone]} />
        ) : undefined
      }
      active={active}
      onClick={onSelect ? () => onSelect(item.key) : undefined}
      // See the header: `aria-pressed` belongs only on a cell that really is a
      // toggle. The coordinator's cells filter the queue in place and stay
      // pressed; the employee's navigate to a filtered list and are gone the
      // moment they are used, so `undefined` removes the attribute for those.
      aria-pressed={toggle ? active : undefined}
    />
  );
}
