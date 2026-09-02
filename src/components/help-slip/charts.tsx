"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Hand-rolled inline SVG. There is no chart library behind any of this.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `recharts` IS a dependency of this repo — the CRM analytics work considered
 * it and declined, and these three follow that precedent
 * (`src/components/order-entry/crm/charts.tsx` says the same thing). Two
 * reasons, and the second is the real one:
 *
 *  1. Weight. Recharts is ~95KB gzipped before it draws anything, and half of
 *     Help Slip's readers are on a mid-range Android on factory-floor mobile
 *     data. A sparkline is a polyline; it does not need a library, so it does
 *     not get one.
 *  2. Control. Every colour below is a `var(--token)`, so both themes track
 *     automatically. A charting library wants concrete colour props, which is
 *     how a hardcoded hex gets into a component and then vanishes in light
 *     mode — the exact bug docs/DESIGN.md opens with.
 *
 * WHAT THESE ARE NOT: decorative. Every one plots real rows. The sparklines
 * are `aria-hidden` precisely because the NUMBER beside them is the
 * accessible fact — a screen reader reading out fourteen daily counts is
 * worse than useless. The shape is for the eye; the figure is for everyone.
 */

// ─── Sparkline ─────────────────────────────────────────────────────────────

export type SparklineProps = {
  /** Oldest first. Fewer than two points renders nothing. */
  values: number[];
  /** A CSS colour — pass a token: `var(--status-blue)`. */
  color: string;
  width?: number;
  height?: number;
  className?: string;
};

export function Sparkline({
  values,
  color,
  width = 88,
  height = 28,
  className,
}: SparklineProps) {
  // useId, not a counter: two cards mounting in the same tick would otherwise
  // share a gradient id and one would silently take the other's fill.
  const gradientId = React.useId();

  if (values.length < 2) return null;

  // 1px of inset top and bottom, so a flat line at the maximum is not clipped
  // in half by the viewBox edge.
  const pad = 1;
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series is the COMMON case on a new dashboard — every value 0. It
  // must draw a centred straight line, not divide by zero.
  const span = max - min || 1;
  const flat = max === min;

  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = flat
      ? height / 2
      : height - pad - ((v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });

  const line = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  // Closed back along the baseline for the wash under the curve.
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden
      focusable="false"
      // overflow-visible so the end dot's radius is not clipped by the edge.
      className={cn("overflow-visible", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The head of the line. It answers "which end is now?" without an axis. */}
      {last ? <circle cx={last[0]} cy={last[1]} r={2.25} fill={color} /> : null}
    </svg>
  );
}

// ─── TrendChart ────────────────────────────────────────────────────────────

export type TrendSeries = {
  key: string;
  label: string;
  /** Same length as `labels`. */
  values: number[];
  /** A CSS custom property NAME, so both themes track automatically. */
  ink: string;
};

const H = 180;
const W = 640;
const PAD_T = 12;
const PAD_B = 22;
const PAD_X = 4;

/**
 * Two series over a date window — "filed and resolved, day by day".
 *
 * ── THE COLOUR PAIR IS NOT FREE CHOICE ────────────────────────────────────
 * The four categorical tones are fine as four separate KPI cards, where
 * nothing is compared side by side. They are not all fine here: the source
 * measured violet + blue at ΔE 7.2 for normal vision and 3.1 under
 * deuteranopia — indistinguishable as two lines in one chart. Violet + amber
 * measures 32.4 normal and 31.5 protan, so that is the pair, and it carries
 * over to our `status-purple` + `status-amber`.
 *
 * Green was rejected on purpose: painting a resolved-count green is exactly
 * how a categorical tone starts being read as a status, and `resolved` is
 * already green on every badge on the screen.
 *
 * Identity never rests on colour alone — there is a legend, and the tooltip
 * names both series.
 */
export function TrendChart({
  labels,
  series,
  summary,
  emptyLabel,
  className,
}: {
  /** One per point, oldest first. Shown in the tooltip, not on an axis. */
  labels: string[];
  series: TrendSeries[];
  /** The sentence a screen reader gets in place of the plot. */
  summary: string;
  emptyLabel: React.ReactNode;
  className?: string;
}) {
  const gradientId = React.useId();
  const [active, setActive] = React.useState<number | null>(null);

  const count = labels.length;
  // A flat run of zeroes must not divide by zero, and one concern should not
  // fill the panel — so the floor is 1 and the scale is padded 15% above.
  const peak = Math.max(1, ...series.flatMap((s) => s.values));
  const empty = series.every((s) => s.values.every((v) => v === 0));

  const x = (i: number) => PAD_X + (i / Math.max(1, count - 1)) * (W - PAD_X * 2);
  const y = (v: number) => PAD_T + (1 - v / (peak * 1.15)) * (H - PAD_T - PAD_B);

  if (empty || count === 0) {
    return (
      <div
        className={cn(
          "flex h-44 items-center justify-center rounded-card bg-surface-2 px-4 text-center",
          className,
        )}
      >
        <p className="deva text-sm text-text-3">{emptyLabel}</p>
      </div>
    );
  }

  const paths = series.map((s) => {
    const line = s.values
      .map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`)
      .join(" ");
    const area = `${line} L${x(count - 1)},${H - PAD_B} L${x(0)},${H - PAD_B} Z`;
    return { ...s, line, area };
  });

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* A legend, always, for two series. Colour is never the only thing
          carrying identity. */}
      <div className="flex flex-wrap items-center gap-4">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: `var(${s.ink})` }}
            />
            {/* Text wears text tokens, never the series colour. */}
            <span className="deva text-[13px] leading-[18px] font-medium text-text-2">
              {s.label}
            </span>
          </span>
        ))}
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={summary}
          className="h-44 w-full touch-none"
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - box.left) / Math.max(1, box.width);
            setActive(
              Math.min(
                count - 1,
                Math.max(0, Math.round(ratio * (count - 1))),
              ),
            );
          }}
          onPointerLeave={() => setActive(null)}
        >
          <defs>
            {paths.map((s) => (
              <linearGradient
                key={s.key}
                id={`${gradientId}-${s.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={`var(${s.ink})`}
                  stopOpacity="0.18"
                />
                <stop
                  offset="100%"
                  stopColor={`var(${s.ink})`}
                  stopOpacity="0"
                />
              </linearGradient>
            ))}
          </defs>

          {/* Recessive grid. Three lines, no axis box, no tick labels — the
              tooltip carries the numbers, so the grid only has to give the eye
              a horizon. */}
          {[0, 0.5, 1].map((f) => (
            <line
              key={f}
              x1={0}
              x2={W}
              y1={PAD_T + f * (H - PAD_T - PAD_B)}
              y2={PAD_T + f * (H - PAD_T - PAD_B)}
              stroke="var(--border)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {paths.map((s) => (
            <g key={s.key}>
              <path d={s.area} fill={`url(#${gradientId}-${s.key})`} />
              <path
                d={s.line}
                fill="none"
                stroke={`var(${s.ink})`}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}

          {active !== null ? (
            <g>
              <line
                x1={x(active)}
                x2={x(active)}
                y1={PAD_T}
                y2={H - PAD_B}
                stroke="var(--border-strong)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              {paths.map((s) => (
                <circle
                  key={s.key}
                  cx={x(active)}
                  cy={y(s.values[active] ?? 0)}
                  r={4}
                  fill={`var(${s.ink})`}
                  // The 2px surface ring is what keeps two overlapping markers
                  // readable when both series sit on the same value.
                  stroke="var(--surface)"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          ) : null}
        </svg>

        {/* An HTML tooltip, not an SVG one: text inside a stretched viewBox is
            scaled with the plot and comes out distorted. */}
        {active !== null ? (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 z-20 w-max max-w-48 -translate-x-1/2 rounded-card border border-border-strong bg-surface-2 px-3 py-2 shadow-lg"
            style={{ left: `${(active / Math.max(1, count - 1)) * 100}%` }}
          >
            <p className="num text-[13px] leading-[18px] text-text-3">
              {labels[active]}
            </p>
            {series.map((s) => (
              <p
                key={s.key}
                className="deva flex items-center gap-2 text-sm text-text-1"
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: `var(${s.ink})` }}
                />
                {s.label}
                <span className="num ml-auto font-semibold">
                  {s.values[active] ?? 0}
                </span>
              </p>
            ))}
          </div>
        ) : null}
      </div>

      {/* The ends of the window, so the plot is anchored in time without an
          axis full of dates nobody reads. */}
      <div className="flex justify-between">
        <span className="num text-[13px] leading-[18px] text-text-3">
          {labels[0]}
        </span>
        <span className="num text-[13px] leading-[18px] text-text-3">
          {labels[count - 1]}
        </span>
      </div>
    </div>
  );
}

// ─── BarList ───────────────────────────────────────────────────────────────

export type BarListItem = {
  key: string;
  label: string;
  value: number;
  /** The portion of `value` that is overdue. Drawn as a second segment. */
  alert?: number;
};

/**
 * Ranked magnitude, as horizontal bars.
 *
 * A bar list rather than a pie: the job is comparing magnitudes across named
 * categories, and length on a common baseline is the encoding people read
 * most accurately. Angle is the one they read worst.
 *
 * HORIZONTAL because the categories are department names — "KATA (Measurement
 * & QC)" rotated onto an x-axis is unreadable, and rotated labels are their
 * own anti-pattern.
 *
 * ── THE OVERDUE SEGMENT ───────────────────────────────────────────────────
 * One bar carries two facts: the total, and how much of it is late. That
 * second segment is the one place a STATUS colour belongs in a chart here —
 * overdue is a state, not a category, so it takes `status-red` rather than a
 * categorical tone, and it is named in a legend rather than relying on the
 * colour to say so. A 2px gap separates the segments so they read as two
 * quantities rather than one bar with a gradient in it.
 */
export function BarList({
  items,
  emptyLabel,
  unitLabel,
  alertLabel,
  className,
}: {
  items: BarListItem[];
  emptyLabel: React.ReactNode;
  /** Named beside the numbers so a bare figure is never left unexplained. */
  unitLabel: React.ReactNode;
  alertLabel: React.ReactNode;
  className?: string;
}) {
  if (items.length === 0) {
    return (
      <div
        className={cn(
          "flex h-32 items-center justify-center rounded-card bg-surface-2 px-4 text-center",
          className,
        )}
      >
        <p className="deva text-sm text-text-3">{emptyLabel}</p>
      </div>
    );
  }

  const peak = Math.max(1, ...items.map((i) => i.value));
  const anyAlert = items.some((i) => (i.alert ?? 0) > 0);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {anyAlert ? (
        <span className="flex items-center gap-2">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-status-red" />
          <span className="deva text-[13px] leading-[18px] font-medium text-text-2">
            {alertLabel}
          </span>
        </span>
      ) : null}

      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const alert = Math.min(item.alert ?? 0, item.value);
          const safe = item.value - alert;
          return (
            <li key={item.key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="deva min-w-0 truncate text-sm text-text-1">
                  {item.label}
                </span>
                <span className="num shrink-0 text-sm font-semibold text-text-1">
                  {item.value}
                  <span className="deva ml-1 text-[13px] font-normal text-text-3">
                    {unitLabel}
                  </span>
                </span>
              </div>

              {/* h-2 keeps the mark thin — the label above it is the thing
                  being read, and a fat bar turns a list into a bar chart
                  competing with its own text. */}
              <div className="flex h-2 gap-0.5 overflow-hidden rounded-pill bg-surface-2">
                <span
                  className="rounded-pill bg-status-purple"
                  style={{ width: `${(safe / peak) * 100}%` }}
                />
                {alert > 0 ? (
                  <span
                    className="rounded-pill bg-status-red"
                    style={{ width: `${(alert / peak) * 100}%` }}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
