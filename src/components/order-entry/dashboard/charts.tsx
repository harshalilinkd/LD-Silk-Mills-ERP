"use client";

// Recharts-backed dashboard charts, ported from Order Entry's
// components/dashboard/dashboard-charts.tsx and repainted with THIS app's
// tokens (see docs/DESIGN.md and src/components/order-entry/crm/charts.tsx).
//
// THEME: not one hex is hardcoded. Every colour handed to recharts is a
// `var(--token)` string, which the browser resolves against whichever palette
// `<html>` currently carries (light on bare :root, dark under `.dark`). SVG
// presentation attributes accept var() the same way CSS does, so flipping the
// theme repaints the charts with no re-render and no JS colour plumbing.
//
//   trend line/fill  → --accent-text  (the token DESIGN.md reserves for marks
//                      sitting directly on the page; it is the one accent that
//                      changes per theme precisely so it stays legible on both
//                      the white and the near-black canvas)
//   completed        → --status-green
//   partially        → --status-amber
//   pending          → --text-3       (matches CHART_COLOURS.due in crm/charts)
//   cancelled        → --status-red
//   grid / axes      → --border / --text-3
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Cell,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCount, formatNumber } from "@/lib/order-entry/orders";

export const TREND_HEIGHT = 232;

/** Respects the OS "reduce motion" setting for the chart entrance animations. */
function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduce;
}

function shortDate(value: string): string {
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(d);
}

/** Axis ticks only — the tooltip always shows the full number. */
function compact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function ChartTooltip({
  active,
  payload,
  label,
  prefix,
  labelMap,
}: {
  active?: boolean;
  payload?: { value?: number | string | (number | string)[] }[];
  label?: string;
  prefix?: string;
  labelMap?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const raw = payload[0]?.value;
  const v = typeof raw === "number" ? raw : Number(raw);
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[12px] shadow-md">
      {label != null ? (
        <div className="mb-0.5 font-semibold text-text-1">
          {labelMap ? labelMap(label) : label}
        </div>
      ) : null}
      <div className="font-mono text-text-2">
        {prefix ?? ""}
        {Number.isFinite(v) ? formatNumber(v) : "—"}
      </div>
    </div>
  );
}

/** Orders-per-day / value-per-day over the selected range. */
export function TrendChart({
  data,
  metric,
}: {
  data: { date: string; orders: number; value: number }[];
  metric: "orders" | "value";
}) {
  const reduce = useReducedMotion();
  return (
    <div
      role="img"
      aria-label={`Order ${metric} trend over the selected date range`}
    >
      <ResponsiveContainer width="100%" height={TREND_HEIGHT}>
        <AreaChart data={data} margin={{ left: -14, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="oeTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-text)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--accent-text)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="var(--border)"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={{ fontSize: 11, fill: "var(--text-3)" }}
            tickLine={false}
            axisLine={false}
            minTickGap={26}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--text-3)" }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={compact}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            content={
              <ChartTooltip
                prefix={metric === "value" ? "₹" : ""}
                labelMap={shortDate}
              />
            }
          />
          <Area
            type="monotone"
            dataKey={metric}
            stroke="var(--accent-text)"
            strokeWidth={2}
            fill="url(#oeTrendFill)"
            isAnimationActive={!reduce}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Order status split as a donut with the total in the hole. Cancelled orders
 * get their own reserved-danger slice so the cancellation flow stays visible
 * next to the panel that counts it.
 */
export function StatusDonut({
  data,
}: {
  data: {
    completed: number;
    partially: number;
    pending: number;
    cancelled: number;
  };
}) {
  const reduce = useReducedMotion();
  const items = [
    { name: "Completed", value: data.completed, color: "var(--status-green)" },
    { name: "Partially", value: data.partially, color: "var(--status-amber)" },
    { name: "Pending", value: data.pending, color: "var(--text-3)" },
    { name: "Cancelled", value: data.cancelled, color: "var(--status-red)" },
  ].filter((i) => i.value > 0);
  const total = items.reduce((s, i) => s + i.value, 0);

  if (total === 0) {
    return (
      <div className="grid h-[200px] place-items-center text-[12.5px] text-text-3">
        No orders in this range.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        role="img"
        aria-label={`Order status split — completed ${data.completed}, partially completed ${data.partially}, pending ${data.pending}, cancelled ${data.cancelled}`}
        className="relative w-full"
      >
        <ResponsiveContainer width="100%" height={184}>
          <PieChart>
            <Pie
              data={items}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={84}
              paddingAngle={2}
              cornerRadius={4}
              strokeWidth={0}
              isAnimationActive={!reduce}
            >
              {items.map((i) => (
                <Cell key={i.name} fill={i.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-[24px] leading-none font-bold tracking-[-0.02em] text-text-1">
            {formatCount(total)}
          </span>
          <span className="mt-1 text-[11px] text-text-3">orders</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[12px]">
        {items.map((i) => (
          <span key={i.name} className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ background: i.color }}
            />
            <span className="text-text-3">{i.name}</span>
            <span className="font-mono font-semibold text-text-1">{i.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
