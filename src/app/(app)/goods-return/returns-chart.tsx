"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Returns by month — a small inline area chart.
 *
 * NOT a charting library. The standalone app pulls one in for this single
 * chart; CRM's rating trend was rebuilt the same way for the same reason, and
 * CLAUDE.md records it: a dependency for one chart is weight every page in the
 * app then carries.
 *
 * ── WHY THE LABELS ARE HTML AND THE CURVE IS SVG ─────────────────────────
 *
 * The first version put everything in one SVG with a fixed `viewBox` and
 * `h-[220px] w-full`. SVG scales uniformly by default, so at any container
 * wider than the viewBox ratio the drawing was letterboxed — a chart floating
 * in the middle of its card with dead space either side, which is exactly what
 * it looked like.
 *
 * `preserveAspectRatio="none"` fixes the fill but stretches everything,
 * including glyphs: axis numbers come out horizontally smeared and the effect
 * is worse than the whitespace. So the SVG holds only geometry — the grid, the
 * area and the line, all of which are happy to be stretched — and every piece
 * of TEXT is HTML positioned in percentages on top. Nothing distorts, and the
 * chart fills whatever it is given at any width.
 */
export type ChartPoint = { month: string; n: number };

const MONTH_LABEL = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
  });
};

const VB_W = 1000;
const VB_H = 300;

export function ReturnsChart({
  data,
  className,
}: {
  /** Oldest first. */
  data: ChartPoint[];
  className?: string;
}) {
  const [hover, setHover] = React.useState<number | null>(null);

  if (data.length < 2) {
    return (
      <div
        className={cn(
          "flex h-[200px] items-center justify-center text-[12.5px] text-text-3",
          className,
        )}
      >
        Not enough months recorded yet to draw a trend.
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.n), 1);
  // Round the axis up to a number a person would pick, so gridlines land on
  // 10 / 20 / 30 rather than 13.667.
  const step = max <= 5 ? 1 : max <= 20 ? 5 : max <= 50 ? 10 : 25;
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);

  // Fractions of the plot area, 0..1 — resolution-independent, so the same
  // numbers drive the stretched SVG and the un-stretched HTML labels.
  const fx = (i: number) => i / (data.length - 1);
  const fy = (v: number) => 1 - v / top;

  const pts = data.map((d, i) => [fx(i) * VB_W, fy(d.n) * VB_H] as const);

  // Catmull-Rom -> cubic Bézier, which is what makes it a smooth curve rather
  // than a polyline. Low tension on purpose: a spike between two low months
  // must not bow the curve below zero and imply a negative month.
  const curve = pts
    .map(([px, py], i) => {
      if (i === 0) return `M ${px} ${py}`;
      const [x0, y0] = pts[i - 1];
      const [xm1, ym1] = pts[i - 2] ?? pts[i - 1];
      const [x2, y2] = pts[i + 1] ?? pts[i];
      return `C ${x0 + (px - xm1) / 6} ${y0 + (py - ym1) / 6}, ${
        px - (x2 - x0) / 6
      } ${py - (y2 - y0) / 6}, ${px} ${py}`;
    })
    .join(" ");

  const area = `${curve} L ${VB_W} ${VB_H} L 0 ${VB_H} Z`;
  const labelEvery = data.length > 8 ? 2 : 1;

  return (
    <div className={cn("w-full", className)}>
      {/* pl leaves room for the y-axis numbers, pb for the month names */}
      <div className="relative h-[190px] pb-6 pl-8 sm:h-[240px]">
        <div className="relative h-full w-full">
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="gr-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.24" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {ticks.map((t) => (
              <line
                key={t}
                x1="0"
                x2={VB_W}
                y1={fy(t) * VB_H}
                y2={fy(t) * VB_H}
                stroke="var(--border)"
                // Stretching scales stroke width too; vectorEffect keeps every
                // gridline exactly 1px whatever the container does.
                vectorEffect="non-scaling-stroke"
                strokeWidth="1"
              />
            ))}

            <path d={area} fill="url(#gr-area)" />
            <path
              d={curve}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.25"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {/* Y-axis numbers, in HTML so they never stretch. */}
          {ticks.map((t) => (
            <span
              key={t}
              className="num absolute -translate-x-full -translate-y-1/2 pr-2 text-[10px] text-text-3 tabular-nums"
              style={{ left: 0, top: `${fy(t) * 100}%` }}
            >
              {t}
            </span>
          ))}

          {/* One hit column per month: aiming at a 3px dot on a phone is
              impossible, and hovering the gap should still answer about the
              nearer month. */}
          {data.map((d, i) => (
            <div
              key={d.month}
              className="absolute top-0 bottom-0"
              style={{
                left: `${(fx(i) - 0.5 / (data.length - 1)) * 100}%`,
                width: `${(1 / (data.length - 1)) * 100}%`,
              }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <span
                className={cn(
                  "absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--primary)] bg-surface transition-transform",
                  hover === i && "scale-[1.45]",
                )}
                style={{ left: "50%", top: `${fy(d.n) * 100}%` }}
              />
              {hover === i && (
                <span
                  className="num pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-field border border-border bg-surface px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap text-text-1 shadow-sm"
                  style={{ left: "50%", top: `calc(${fy(d.n) * 100}% - 8px)` }}
                >
                  {d.n} in {MONTH_LABEL(d.month)}
                </span>
              )}
            </div>
          ))}

          {/* Month names, also HTML. */}
          {data.map((d, i) =>
            i % labelEvery === 0 ? (
              <span
                key={`l-${d.month}`}
                className="absolute -translate-x-1/2 pt-1.5 text-[10px] whitespace-nowrap text-text-3"
                style={{ left: `${fx(i) * 100}%`, top: "100%" }}
              >
                {MONTH_LABEL(d.month)}
              </span>
            ) : null,
          )}
        </div>
      </div>

      <span className="sr-only">
        Returns by month:{" "}
        {data.map((d) => `${MONTH_LABEL(d.month)} ${d.n}`).join(", ")}
      </span>
    </div>
  );
}
