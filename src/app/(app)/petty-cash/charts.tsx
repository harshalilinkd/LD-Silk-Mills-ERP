"use client";

// Recharts-backed Dashboard charts — same approach as
// `components/order-entry/dashboard/charts.tsx`: every colour handed to
// recharts is a `var(--token)` string so the SVG repaints itself when the
// theme flips, with no re-render and no JS colour plumbing. See that file's
// header for the full reasoning; this is the same recipe applied to cash
// flow instead of order volume.
import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { monthLabel } from "@/lib/dates";
import { formatMoney } from "@/lib/petty-cash/money";

export const TREND_HEIGHT = 260;

/** Respects the OS "reduce motion" setting for the chart entrance animations. */
function useReducedMotion(): boolean {
  const [reduce, setReduce] = React.useState(false);
  React.useEffect(() => {
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

/**
 * Axis ticks only — the tooltip always shows the full rupee figure.
 *
 * A negative tick carries U+2212, not a hyphen, the same as every other figure
 * in the module (see the money rules in `docs/DESIGN.md`). On an axis that
 * crosses zero it is the glyph telling somebody the month went backwards.
 */
function compact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `${sign}${(abs / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}k`;
  return `${sign}${abs}`;
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
  const net = payload.find((p) => p.dataKey === "balance")?.value ?? 0;
  return (
    <div className="min-w-[160px] rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-[12px] shadow-lg">
      <div className="mb-1.5 flex items-center justify-between gap-3 border-b border-border pb-1.5">
        <span className="font-semibold text-text-1">
          {label ? monthLabel(label) : ""}
        </span>
        <span
          className={`num text-[11px] font-bold ${net < 0 ? "text-status-red" : "text-status-green"}`}
        >
          {net < 0 ? "▼" : "▲"} {formatMoney(Math.abs(net))}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {payload
          .filter((p) => p.dataKey !== "balance")
          .map((p) => (
            <div key={p.dataKey} className="flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: p.color }}
              />
              <span className="text-text-3">
                {NAME[p.dataKey ?? ""] ?? p.dataKey}
              </span>
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
 * Money in vs money out, month by month, with the net balance as a filled
 * area riding over the bars — the classic cash-flow-statement shape: two
 * bars answer "how much moved", the shaded line answers "which way it net
 * out, and by how much" without needing a second axis.
 *
 * Bars carry a top-to-bottom gradient rather than a flat fill and the net
 * line rides a soft fill of its own — small touches, but a flat-filled bar
 * chart on a white card is what "basic" looks like, and this is the same
 * data with the depth a real reporting pack has.
 */
export function CashFlowChart({
  data,
}: {
  data: { month: string; credits: number; debits: number; balance: number }[];
}) {
  const reduce = useReducedMotion();
  return (
    <div
      role="img"
      aria-label="Money in and out by month, with the net balance"
    >
      <ResponsiveContainer width="100%" height={TREND_HEIGHT}>
        <ComposedChart
          data={data}
          margin={{ left: -14, right: 8, top: 8, bottom: 0 }}
          barGap={4}
        >
          <defs>
            <linearGradient id="pcCreditFill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--status-green)"
                stopOpacity={1}
              />
              <stop
                offset="100%"
                stopColor="var(--status-green)"
                stopOpacity={0.55}
              />
            </linearGradient>
            <linearGradient id="pcDebitFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--status-red)" stopOpacity={1} />
              <stop
                offset="100%"
                stopColor="var(--status-red)"
                stopOpacity={0.55}
              />
            </linearGradient>
            <linearGradient id="pcNetFill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--accent-text)"
                stopOpacity={0.32}
              />
              <stop
                offset="100%"
                stopColor="var(--accent-text)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="var(--border)"
            strokeDasharray="3 3"
            vertical={false}
          />
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
          {/* Where the axis crosses zero — the line a negative net has to fall
              below, drawn once rather than left to the reader to eyeball. */}
          <ReferenceLine y={0} stroke="var(--border-strong)" strokeWidth={1} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={<CashFlowTooltip />}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="circle"
            iconSize={8}
            formatter={(value) => (
              <span className="text-[11.5px] text-text-2">{value}</span>
            )}
          />
          <Bar
            dataKey="credits"
            name="In"
            fill="url(#pcCreditFill)"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            isAnimationActive={!reduce}
            animationDuration={500}
          />
          <Bar
            dataKey="debits"
            name="Out"
            fill="url(#pcDebitFill)"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            isAnimationActive={!reduce}
            animationDuration={500}
          />
          <Line
            type="monotone"
            dataKey="balance"
            name="Net"
            stroke="var(--accent-text)"
            strokeWidth={2.5}
            fill="url(#pcNetFill)"
            dot={{
              r: 3.5,
              fill: "var(--accent-text)",
              strokeWidth: 2,
              stroke: "var(--surface)",
            }}
            activeDot={{ r: 5.5, strokeWidth: 2, stroke: "var(--surface)" }}
            isAnimationActive={!reduce}
            animationDuration={700}
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
 * same shape as Order Entry's `StatusDonut`, plus a hover state (the pointed-
 * at slice lifts and the hole's figure follows it) and a legend that carries
 * the share, not just a colour key. Categories beyond the fifth fold into
 * "Other" rather than adding a sixth colour nobody could hold in their head.
 */
export function CategoryDonut({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  const reduce = useReducedMotion();
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);

  const sorted = [...data]
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 5);
  const restTotal = sorted.slice(5).reduce((s, d) => s + d.value, 0);
  const items = [
    ...top.map((d, i) => ({ ...d, color: SLICE_COLOURS[i] })),
    ...(restTotal > 0
      ? [{ name: "Other", value: restTotal, color: "var(--text-3)" }]
      : []),
  ];
  const total = items.reduce((s, i) => s + i.value, 0);

  if (total === 0) {
    return (
      <div className="grid h-[184px] place-items-center text-[12.5px] text-text-3">
        Nothing paid out this month.
      </div>
    );
  }

  const shown = activeIndex != null ? items[activeIndex] : null;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        role="img"
        aria-label={`Spend by category — ${items.map((i) => `${i.name} ${formatMoney(i.value)}`).join(", ")}`}
        className="relative w-full"
      >
        <ResponsiveContainer width="100%" height={188}>
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
              animationDuration={600}
              onMouseEnter={(_, i) => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {items.map((i) => (
                <Cell
                  key={i.name}
                  fill={i.color}
                  className="cursor-pointer transition-opacity"
                  opacity={
                    activeIndex == null || items[activeIndex]?.name === i.name
                      ? 1
                      : 0.45
                  }
                />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0];
                const pct = total
                  ? Math.round((Number(p.value) / total) * 100)
                  : 0;
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
          {shown ? (
            <>
              <span className="num text-[15px] leading-none font-bold tracking-[-0.02em] text-text-1">
                {formatMoney(shown.value)}
              </span>
              <span className="mt-1 max-w-[110px] truncate text-[11px] text-text-3">
                {shown.name}
              </span>
            </>
          ) : (
            <>
              <span className="num text-[15px] leading-none font-bold tracking-[-0.02em] text-text-1">
                {formatMoney(total)}
              </span>
              <span className="mt-1 text-[11px] text-text-3">paid out</span>
            </>
          )}
        </div>
      </div>
      <div className="flex w-full flex-col gap-1">
        {items.map((i, idx) => {
          const pct = total ? Math.round((i.value / total) * 100) : 0;
          const active = activeIndex === idx;
          return (
            <button
              key={i.name}
              type="button"
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseLeave={() => setActiveIndex(null)}
              className={`flex cursor-default items-center gap-2 rounded-field px-1.5 py-1 text-left transition-colors ${active ? "bg-surface-2" : ""}`}
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: i.color }}
              />
              <span className="min-w-0 flex-1 truncate text-[12px] text-text-2">
                {i.name}
              </span>
              <span className="num shrink-0 text-[11.5px] font-semibold text-text-1">
                {formatMoney(i.value)}
              </span>
              <span className="num w-9 shrink-0 text-right text-[11px] text-text-3">
                {pct}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Spend by GROUP (the heading the monthly summary rolls up to) as a
 * horizontal bar — the companion to the category donut above. A donut answers
 * "what share", a ranked bar answers "who's ahead of whom", and a month with
 * more than two or three groups is easier to rank as bars than as wedges.
 */
export function GroupBarChart({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  const reduce = useReducedMotion();
  const sorted = [...data]
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  if (sorted.length === 0) {
    return (
      <div className="grid h-[184px] place-items-center text-[12.5px] text-text-3">
        Nothing paid out this month.
      </div>
    );
  }

  const items = sorted.map((d, i) => ({
    ...d,
    color: SLICE_COLOURS[i % SLICE_COLOURS.length],
  }));
  const height = Math.max(120, items.length * 34 + 20);

  return (
    <div
      role="img"
      aria-label={`Spend by group — ${items.map((i) => `${i.name} ${formatMoney(i.value)}`).join(", ")}`}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={items}
          layout="vertical"
          margin={{ left: 0, right: 28, top: 4, bottom: 4 }}
          barCategoryGap={10}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tick={{ fontSize: 12, fill: "var(--text-2)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0];
              return (
                <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[12px] shadow-md">
                  <div className="font-semibold text-text-1">
                    {p.payload.name}
                  </div>
                  <div className="num text-text-2">
                    {formatMoney(Number(p.value))}
                  </div>
                </div>
              );
            }}
          />
          <Bar
            dataKey="value"
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
            isAnimationActive={!reduce}
          >
            {items.map((i) => (
              <Cell key={i.name} fill={i.color} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v) => formatMoney(Number(v))}
              className="num"
              style={{ fill: "var(--text-1)", fontSize: 11, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
