"use client";

// Recharts-backed Dashboard charts — same approach as
// `components/order-entry/dashboard/charts.tsx`: every colour handed to
// recharts is a `var(--token)` string so the SVG repaints itself when the
// theme flips, with no re-render and no JS colour plumbing. See that file's
// header for the full reasoning; this is the same recipe applied to cash
// flow instead of order volume.
import { useEffect, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { monthLabel } from "@/lib/dates";
import { formatMoney } from "@/lib/petty-cash/money";

export const TREND_HEIGHT = 240;

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

function shortMonth(iso: string): string {
  return monthLabel(iso).replace(/\s\d{4}$/, "");
}

/** Axis ticks only — the tooltip always shows the full rupee figure. */
function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

function CashFlowTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey?: string; value?: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const NAME: Record<string, string> = {
    credits: "In",
    debits: "Out",
    balance: "Net",
  };
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[12px] shadow-md">
      <div className="mb-1 font-semibold text-text-1">
        {label ? monthLabel(label) : ""}
      </div>
      <div className="flex flex-col gap-0.5">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: p.color }}
            />
            <span className="text-text-3">{NAME[p.dataKey ?? ""] ?? p.dataKey}</span>
            <span className="num ml-auto font-semibold text-text-1">
              {formatMoney(p.value ?? 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Money in vs money out, month by month, with the net balance line over the
 * top of it — the classic cash-flow-statement shape: two bars answer "how
 * much moved", the line answers "which way did it net out".
 */
export function CashFlowChart({
  data,
}: {
  data: { month: string; credits: number; debits: number; balance: number }[];
}) {
  const reduce = useReducedMotion();
  return (
    <div role="img" aria-label="Money in and out by month, with the net balance">
      <ResponsiveContainer width="100%" height={TREND_HEIGHT}>
        <ComposedChart data={data} margin={{ left: -14, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={shortMonth}
            tick={{ fontSize: 11, fill: "var(--text-3)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--text-3)" }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={compact}
          />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<CashFlowTooltip />} />
          <Bar
            dataKey="credits"
            name="In"
            fill="var(--status-green)"
            radius={[3, 3, 0, 0]}
            isAnimationActive={!reduce}
          />
          <Bar
            dataKey="debits"
            name="Out"
            fill="var(--status-red)"
            radius={[3, 3, 0, 0]}
            isAnimationActive={!reduce}
          />
          <Line
            type="monotone"
            dataKey="balance"
            name="Net"
            stroke="var(--accent-text)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "var(--accent-text)", strokeWidth: 0 }}
            isAnimationActive={!reduce}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// Five distinct hues before falling back to grey for "everything else" — the
// same palette `--chart-1`…`--chart-5` reserves for exactly this.
const SLICE_COLOURS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/**
 * Where this month's spend went, as a donut with the total in the hole — the
 * same shape as Order Entry's `StatusDonut`. Categories beyond the fifth are
 * folded into "Other" rather than adding a sixth colour nobody could hold in
 * their head against the legend.
 */
export function CategoryDonut({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  const reduce = useReducedMotion();
  const sorted = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 5);
  const restTotal = sorted.slice(5).reduce((s, d) => s + d.value, 0);
  const items = [
    ...top.map((d, i) => ({ ...d, color: SLICE_COLOURS[i] })),
    ...(restTotal > 0 ? [{ name: "Other", value: restTotal, color: "var(--text-3)" }] : []),
  ];
  const total = items.reduce((s, i) => s + i.value, 0);

  if (total === 0) {
    return (
      <div className="grid h-[184px] place-items-center text-[12.5px] text-text-3">
        Nothing paid out this month.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        role="img"
        aria-label={`Spend by category — ${items.map((i) => `${i.name} ${formatMoney(i.value)}`).join(", ")}`}
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
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0];
                const pct = total ? Math.round((Number(p.value) / total) * 100) : 0;
                return (
                  <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[12px] shadow-md">
                    <div className="font-semibold text-text-1">{p.name}</div>
                    <div className="num text-text-2">
                      {formatMoney(Number(p.value))} · {pct}%
                    </div>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="num text-[15px] leading-none font-bold tracking-[-0.02em] text-text-1">
            {formatMoney(total)}
          </span>
          <span className="mt-1 text-[11px] text-text-3">paid out</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[12px]">
        {items.map((i) => (
          <span key={i.name} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: i.color }} />
            <span className="max-w-[120px] truncate text-text-3">{i.name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
