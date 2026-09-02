"use client";

// StatCard — docs/SCREENS.md §0.4, §3.3
//
// The KPI tile. Props: icon · label · value · sub · tone · trend · onClick ·
// active.
//
// Two rules the spec is emphatic about:
//
//  1. **With `onClick` it is a REAL button.** Not a div with a handler: it
//     renders as <button>, carries `aria-pressed`, is in the tab order and
//     responds to Enter and Space. Every KPI tile on the Orders screen and
//     the CRM lists is a filter, so a keyboard user must be able to reach it.
//     (The explicit role/tabIndex/key handling below is what the spec asks
//     for by name; <button> already gives most of it, and the handler makes
//     the behaviour true regardless of the element that ends up rendering.)
//
//  2. **Below `sm` it drops the icon square and the sub-label.** Five or six
//     of these sit two-across on a phone. The figure and its label are what
//     survive the cut; the 36px tinted square and the "Tap to filter" hint
//     are what push the value onto a second line.
//
// Colours are translated from the spec's palette to ours (docs/DESIGN.md):
// accent → primary/accent-text, success → status-green, warning →
// status-amber, danger → status-red, neutral → chip/text-2.

import * as React from "react";
import { cn } from "@/lib/utils";

export type StatTone = "accent" | "success" | "warning" | "danger" | "neutral";

const TONE_TILE: Record<StatTone, string> = {
  // --accent is already a translucent teal wash in both themes, so it needs
  // no /10 opacity step the way a solid hue does.
  accent: "bg-accent text-accent-text",
  success: "bg-status-green-dim text-status-green",
  warning: "bg-status-amber-dim text-status-amber",
  danger: "bg-status-red-dim text-status-red",
  neutral: "bg-chip text-text-2",
};

export type StatCardProps = {
  icon?: React.ReactNode;
  label: React.ReactNode;
  /** A node, so callers can pass <Money> / <AnimatedNumber> straight in. */
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: StatTone;
  /** Signed percentage/delta. Positive reads green, negative red, 0 neutral. */
  trend?: number | null;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  /** Forwarded to the button so screen readers get more than the label. */
  "aria-label"?: string;
};

export function StatCard({
  icon,
  label,
  value,
  sub,
  tone = "accent",
  trend,
  onClick,
  active = false,
  className,
  ...aria
}: StatCardProps) {
  const interactive = typeof onClick === "function";

  const body = (
    <>
      {icon != null && (
        // `hidden sm:grid` is rule 2: no icon square on a phone.
        <span
          className={cn(
            "hidden size-9 shrink-0 place-items-center rounded-[10px] sm:grid",
            "[&_svg]:size-[17px]",
            TONE_TILE[tone],
          )}
          aria-hidden
        >
          {icon}
        </span>
      )}
      <span className="flex min-w-0 flex-col text-left">
        <span className="text-[11px] leading-tight font-medium text-text-2">
          {label}
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="num text-[19px] leading-tight font-semibold text-text-1">
            {value}
          </span>
          {trend != null && trend !== 0 && (
            <span
              className={cn(
                "num text-[11px] leading-tight font-semibold",
                trend > 0 ? "text-status-green" : "text-status-red",
              )}
            >
              {trend > 0 ? "▲" : "▼"}
              {Math.abs(trend)}%
            </span>
          )}
        </span>
        {sub != null && (
          // Rule 2 again: the sub-label is desktop-only.
          <span className="hidden text-[10px] leading-tight text-text-3 sm:block">
            {sub}
          </span>
        )}
      </span>
    </>
  );

  const shell = cn(
    "flex items-center gap-2.5 rounded-card border bg-surface p-2.5 shadow-sm transition-colors",
    active
      ? // Spec: `border-accent ring-2 ring-accent/25`. Our accent FILL token
        // is --primary and the focus-ring token is --ring (which aliases it).
        "border-primary ring-2 ring-ring/25"
      : "border-border",
    interactive && !active && "hover:border-border-strong",
    interactive && "cursor-pointer text-left outline-none",
    interactive &&
      "focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40",
    className,
  );

  if (!interactive) {
    return <div className={shell}>{body}</div>;
  }

  return (
    <button
      type="button"
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onClick}
      onKeyDown={(e) => {
        // Native <button> already fires click on Enter/Space; this makes the
        // contract explicit and survives the element being swapped for a
        // div-with-role by a caller wrapping it (§1.2B wraps tiles in Links).
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          onClick();
        }
      }}
      className={shell}
      {...aria}
    >
      {body}
    </button>
  );
}
