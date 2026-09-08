"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The charts the reports dashboards are drawn with
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Recharts, the same approach as `petty-cash/charts.tsx` and
 * `order-entry/dashboard/charts.tsx`: every colour handed to a chart is a
 * `var(--token)` string, so the SVG repaints itself when the theme flips with
 * no JS colour plumbing and no re-render.
 *
 * ── ONE SHAPE PER QUESTION ───────────────────────────────────────────────
 *
 * A dashboard that repeats one chart eight times is a table with extra steps.
 * Each of these answers a different shape of question, which is why there are
 * six of them and not one configurable one:
 *
 *   · `ComboMonthly` — how much AND how many, over time. Bars carry the money,
 *     the line carries the order count on its own axis, so a month with fewer
 *     but bigger orders is visible instead of averaged away.
 *   · `SharePie`     — composition. Donut when the middle is worth a figure.
 *   · `RankedBars`   — "who is biggest", horizontal so long party names fit.
 *   · `CountColumns` — a ranking of counts, labelled on top.
 *   · `Gauge`        — one percentage, on its own, read at a glance.
 *   · `FunnelRows`   — a sequence that only ever shrinks, with what fell away.
 *
 * Numbers are formatted with `lib/reports/format` — the same functions the
 * workbook uses — so a figure never reads one way on screen and another in the
 * file.
 */

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { count, inr, inrShort, monthName, pct } from "@/lib/reports/format";
import { cn } from "@/lib/utils";

/**
 * Eight tokens, rotated. Deliberately not eight shades of one hue: the owner's
 * reference dashboards use distinct colours per slice, and a reader matching a
 * legend entry to a wedge needs them to be tellable apart at a glance.
 */
export const SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-5)",
  "var(--status-green)",
  "var(--chart-4)",
  "var(--accent-text)",
  "var(--text-3)",
] as const;

export const colourAt = (i: number) => SERIES[i % SERIES.length];

/** Respects the OS "reduce motion" setting for the entrance animations. */
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

/** Axis ticks only — every tooltip shows the full figure. */
function compact(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `${sign}${(abs / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}k`;
  return `${sign}${abs}`;
}

const shortMonth = (iso: string) => monthName(iso).replace(/\s\d{4}$/, "");

function Box({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-w-[150px] rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-[12px] shadow-lg">
      {children}
    </div>
  );
}

// ─── how much and how many, over time ──────────────────────────────────────

type MonthPoint = { month: string; value: number; orders: number; metres: number };

function MonthTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload?: MonthPoint }[];
  label?: string;
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <Box>
      <div className="mb-1.5 border-b border-border pb-1.5 font-semibold text-text-1">
        {label ? monthName(label) : ""}
      </div>
      <dl className="flex flex-col gap-1">
        <div className="flex items-center gap-4">
          <dt className="text-text-3">Value</dt>
          <dd className="num ml-auto font-semibold text-text-1">{inr(p.value)}</dd>
        </div>
        <div className="flex items-center gap-4">
          <dt className="text-text-3">Orders</dt>
          <dd className="num ml-auto font-semibold text-text-1">{count(p.orders)}</dd>
        </div>
        <div className="flex items-center gap-4">
          <dt className="text-text-3">Metres</dt>
          <dd className="num ml-auto font-semibold text-text-1">{count(Math.round(p.metres))}</dd>
        </div>
      </dl>
    </Box>
  );
}

export function ComboMonthly({ data, height = 280 }: { data: MonthPoint[]; height?: number }) {
  const reduce = useReducedMotion();
  return (
    <div role="img" aria-label="Order value and order count, month by month">
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ left: -12, right: 4, top: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="rdValueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={1} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.5} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={shortMonth}
            tick={{ fontSize: 11, fill: "var(--text-3)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            yAxisId="money"
            tick={{ fontSize: 11, fill: "var(--text-3)" }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={compact}
          />
          <YAxis
            yAxisId="orders"
            orientation="right"
            tick={{ fontSize: 11, fill: "var(--chart-3)" }}
            tickLine={false}
            axisLine={false}
            width={38}
          />
          <Tooltip content={<MonthTip />} cursor={{ fill: "var(--chip)" }} />
          <Bar
            yAxisId="money"
            dataKey="value"
            name="Value"
            fill="url(#rdValueFill)"
            radius={[4, 4, 0, 0]}
            maxBarSize={46}
            isAnimationActive={!reduce}
          />
          <Line
            yAxisId="orders"
            type="monotone"
            dataKey="orders"
            name="Orders"
            stroke="var(--chart-3)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "var(--chart-3)", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={!reduce}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <Legend
        items={[
          { label: "Order value (bars)", colour: "var(--chart-1)" },
          { label: "Number of orders (line)", colour: "var(--chart-3)" },
        ]}
      />
    </div>
  );
}

// ─── composition ───────────────────────────────────────────────────────────

export type Slice = { label: string; value: number; meta?: string };

export function Legend({ items }: { items: { label: string; colour: string; note?: string }[] }) {
  return (
    <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-[11.5px] text-text-3">
          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: i.colour }} />
          <span className="text-text-2">{i.label}</span>
          {i.note && <span className="num text-text-3">{i.note}</span>}
        </li>
      ))}
    </ul>
  );
}

export function SharePie({
  data,
  money = true,
  donut = false,
  centreLabel,
  centreValue,
  height = 260,
}: {
  data: Slice[];
  money?: boolean;
  donut?: boolean;
  centreLabel?: string;
  centreValue?: string;
  height?: number;
}) {
  const reduce = useReducedMotion();
  const total = data.reduce((t, d) => t + d.value, 0);
  const fmt = (v: number) => (money ? inr(v) : count(v));

  return (
    <div role="img" aria-label={data.map((d) => `${d.label} ${fmt(d.value)}`).join(", ")}>
      <div className="relative">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart margin={{ top: 4, bottom: 4, left: 4, right: 4 }}>
            <Tooltip
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as Slice | undefined;
                if (!active || !p) return null;
                return (
                  <Box>
                    <div className="font-semibold text-text-1">{p.label}</div>
                    <div className="num mt-1 text-text-2">{fmt(p.value)}</div>
                    <div className="num text-text-3">
                      {total > 0 ? pct((p.value / total) * 100) : "—"} of the total
                    </div>
                    {p.meta && <div className="mt-0.5 text-text-3">{p.meta}</div>}
                  </Box>
                );
              }}
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={donut ? "58%" : 0}
              outerRadius="82%"
              paddingAngle={donut ? 2 : 0}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={!reduce}
            >
              {data.map((d, i) => (
                <Cell key={d.label} fill={colourAt(i)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {donut && (centreValue || centreLabel) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            {centreValue && (
              <span className="num text-[22px] font-bold text-text-1">{centreValue}</span>
            )}
            {centreLabel && (
              <span className="mt-0.5 text-[11px] text-text-3">{centreLabel}</span>
            )}
          </div>
        )}
      </div>
      <Legend
        items={data.map((d, i) => ({
          label: d.label,
          colour: colourAt(i),
          note: total > 0 ? pct((d.value / total) * 100, 0) : undefined,
        }))}
      />
    </div>
  );
}

// ─── rankings ──────────────────────────────────────────────────────────────

export function RankedBars({
  data,
  money = true,
  colour,
  height,
}: {
  data: Slice[];
  money?: boolean;
  colour?: string;
  height?: number;
}) {
  const reduce = useReducedMotion();
  const fmt = (v: number) => (money ? inrShort(v) : count(v));
  const h = height ?? Math.max(150, data.length * 30 + 24);
  // Long party names need the room; short stage names should not waste it.
  const width = Math.min(160, Math.max(78, ...data.map((d) => d.label.length * 6.4)));

  return (
    <div role="img" aria-label={data.map((d) => `${d.label} ${fmt(d.value)}`).join(", ")}>
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 46, top: 2, bottom: 2 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={width}
            tick={{ fontSize: 11.5, fill: "var(--text-2)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--chip)" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as Slice | undefined;
              if (!active || !p) return null;
              return (
                <Box>
                  <div className="font-semibold text-text-1">{p.label}</div>
                  <div className="num mt-1 text-text-2">{money ? inr(p.value) : count(p.value)}</div>
                  {p.meta && <div className="text-text-3">{p.meta}</div>}
                </Box>
              );
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={!reduce}>
            {data.map((d, i) => (
              <Cell key={d.label} fill={colour ?? colourAt(i)} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v: unknown) => fmt(Number(v))}
              style={{ fontSize: 11, fill: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CountColumns({
  data,
  money = false,
  height = 280,
}: {
  data: Slice[];
  money?: boolean;
  height?: number;
}) {
  const reduce = useReducedMotion();
  const fmt = (v: number) => (money ? inrShort(v) : count(v));
  return (
    <div role="img" aria-label={data.map((d) => `${d.label} ${fmt(d.value)}`).join(", ")}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ left: -12, right: 4, top: 22, bottom: 4 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10.5, fill: "var(--text-3)" }}
            tickLine={false}
            axisLine={false}
            interval={0}
            angle={-18}
            textAnchor="end"
            height={54}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--text-3)" }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={compact}
          />
          <Tooltip
            cursor={{ fill: "var(--chip)" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as Slice | undefined;
              if (!active || !p) return null;
              return (
                <Box>
                  <div className="font-semibold text-text-1">{p.label}</div>
                  <div className="num mt-1 text-text-2">{money ? inr(p.value) : count(p.value)}</div>
                  {p.meta && <div className="text-text-3">{p.meta}</div>}
                </Box>
              );
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={54} isAnimationActive={!reduce}>
            {data.map((d, i) => (
              <Cell key={d.label} fill={colourAt(i)} />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              formatter={(v: unknown) => fmt(Number(v))}
              style={{ fontSize: 11, fill: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── one percentage, on its own ────────────────────────────────────────────

/**
 * The ring KPI from the owner's reference dashboard. Recharts is overkill for
 * two arcs, so this is an SVG circle with a dash offset — it scales, it needs
 * no client measurement, and it inherits the theme through the tokens.
 */
export function Gauge({
  value,
  label,
  sub,
  tone = "accent",
  size = 92,
}: {
  value: number;
  label: string;
  sub?: string;
  tone?: "accent" | "good" | "warn" | "bad";
  size?: number;
}) {
  const stroke = {
    accent: "var(--chart-1)",
    good: "var(--status-green)",
    warn: "var(--status-amber)",
    bad: "var(--status-red)",
  }[tone];
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className="flex items-center gap-3.5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--chip-strong)"
            strokeWidth={10}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (clamped / 100) * c}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <span className="num absolute inset-0 flex items-center justify-center text-[15px] font-bold text-text-1">
          {pct(value, 0)}
        </span>
      </div>
      <div className="min-w-0">
        <div className="text-[13px] leading-snug font-semibold text-text-1">{label}</div>
        {sub && <div className="mt-0.5 text-[11.5px] leading-snug text-text-3">{sub}</div>}
      </div>
    </div>
  );
}

// ─── a sequence that only shrinks ──────────────────────────────────────────

/**
 * The funnel. Plain CSS bars rather than a chart library: the whole point is
 * that each row is a fixed proportion of the row above it, and a div whose
 * width is a percentage says that more honestly than an SVG that has been
 * scaled to fit a container.
 */
export function FunnelRows({
  rows,
  total,
}: {
  rows: { no?: number; label: string; done: number; lost?: number }[];
  total: number;
}) {
  return (
    <ol className="flex flex-col gap-2">
      {rows.map((r, i) => {
        const share = total > 0 ? (r.done / total) * 100 : 0;
        return (
          // 130 + 62 + 70 of fixed columns plus gaps came to more than a
          // 320px phone has, so the row could not fit and the page scrolled
          // sideways. Below `sm` the stage name takes a line of its own and
          // the bar keeps the rest; from `sm` up nothing moves.
          <li key={r.label} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span
              className="w-full shrink-0 truncate text-[12px] text-text-2 sm:w-[130px]"
              title={r.label}
            >
              {r.no ? `${r.no}. ` : ""}
              {r.label}
            </span>
            <span className="h-5 min-w-0 flex-1 overflow-hidden rounded-[4px] bg-chip">
              <span
                className="block h-full rounded-[4px] transition-[width]"
                style={{ width: `${Math.max(share, 0.6)}%`, background: colourAt(i) }}
              />
            </span>
            <span className="num w-[52px] shrink-0 text-right text-[12px] font-semibold text-text-1 sm:w-[62px]">
              {count(r.done)}
            </span>
            <span
              className={cn(
                "num w-[56px] shrink-0 text-right text-[11px] sm:w-[70px]",
                r.lost ? "text-status-red" : "text-text-3",
              )}
            >
              {i === 0 ? pct(share, 0) : r.lost ? `−${count(r.lost)}` : pct(share, 0)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
