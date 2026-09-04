"use client";

// Restyled from Order Entry's components/crm/crm-charts-lite.tsx against this
// app's design tokens — CSS/SVG only, no charting library (same reasoning as
// the source: a chart must be readable by someone who has never seen it
// before, and every shape here is one nobody has to be taught).
//
// RatingTrendLine is NEW here, replacing the source's Recharts-based
// components/crm/crm-charts.tsx `RatingTrend` — see the CRM port plan: this
// app doesn't carry recharts as a dependency for one chart, so the monthly
// rating trend is a small hand-rolled inline SVG line instead.
import { formatCount } from "@/lib/order-entry/orders";
import { cn } from "@/lib/utils";

/**
 * Coverage — one number against a target. A big figure and a track, not a
 * dial: at low percentages a dial shows nothing a reader can interpret,
 * while a track with the target marked shows exactly how far off it is.
 */
export function CoverageMeter({
  pct,
  contacted,
  followups,
  target = 85,
}: {
  pct: number;
  contacted: number;
  followups: number;
  target?: number;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const tone =
    clamped >= target
      ? "bg-status-green"
      : clamped >= 50
        ? "bg-status-amber"
        : "bg-status-red";
  const toneText =
    clamped >= target
      ? "text-status-green"
      : clamped >= 50
        ? "text-status-amber"
        : "text-status-red";

  return (
    <div className="px-4 pb-5 sm:px-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div
            className={cn(
              "num text-[40px] leading-[0.95] font-bold tracking-[-0.02em]",
              toneText,
            )}
          >
            {pct}%
          </div>
          <div className="mt-1 text-[12.5px] font-medium text-text-3">
            of delivered orders called
          </div>
        </div>
        <div className="text-right">
          <div className="num text-[20px] leading-none font-bold text-text-1">
            {formatCount(contacted)}
            <span className="text-[14px] font-medium text-text-3">
              /{formatCount(followups)}
            </span>
          </div>
          <div className="mt-1 text-[11.5px] text-text-3">called</div>
        </div>
      </div>

      <div className="relative mt-5 h-3.5 w-full overflow-hidden rounded-full bg-surface-2">
        <span
          className={cn(
            "block h-full rounded-full transition-all duration-500",
            tone,
          )}
          style={{ width: `${Math.max(clamped, 1.5)}%` }}
        />
      </div>
      {/* The target sits on its own line under the track, with the gap named
          out — "how far off are we" is the question, and a bare marker
          would make the reader measure it by eye. */}
      <div className="relative mt-1.5 h-4">
        <span
          className="absolute -top-[22px] h-5 w-[2px] rounded-full bg-text-1"
          style={{ left: `${target}%` }}
        />
        <span
          className="absolute -translate-x-1/2 text-[11px] font-medium text-text-3"
          style={{ left: `${target}%` }}
        >
          target {target}%
        </span>
      </div>

      <p className="mt-3 border-t border-border pt-2.5 text-[12px] leading-relaxed text-text-3">
        {clamped >= target ? (
          <>On target — keep it there.</>
        ) : (
          <>
            <b className="num text-text-1">
              {formatCount(
                Math.max(0, Math.ceil((target / 100) * followups) - contacted),
              )}
            </b>{" "}
            more calls would reach the {target}% target.
          </>
        )}
      </p>
    </div>
  );
}

/** The queue — five parts of ONE whole, so one stacked bar and a legend. */
export function QueueBar({
  parts,
}: {
  parts: { key: string; label: string; count: number; color: string }[];
}) {
  const total = parts.reduce((n, p) => n + p.count, 0) || 1;
  return (
    <div className="flex flex-col justify-center px-4 pb-5 sm:px-5">
      <div className="flex h-6 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border">
        {parts.map((p) =>
          p.count > 0 ? (
            <span
              key={p.key}
              title={`${p.label}: ${p.count}`}
              className="h-full transition-all"
              style={{
                width: `${(p.count / total) * 100}%`,
                background: p.color,
              }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {parts.map((p) => (
          <span
            key={p.key}
            className="inline-flex items-center gap-1.5 text-[12.5px]"
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: p.color }}
            />
            <span className="truncate font-medium text-text-3">{p.label}</span>
            <span className="ml-auto num font-semibold text-text-1">
              {formatCount(p.count)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The SLA 2×2 — kept, because it's the one shape here a bar can't replace.
 * The finding isn't "how many were late"; it's WHERE WE AND THE CUSTOMER
 * DISAGREE, and only a quadrant shows agreement and disagreement at once.
 * Each cell states the conclusion to draw from it, so it needs no key.
 */
export function OnTimeQuadrant({
  data,
}: {
  data: {
    bothOnTime: number;
    bothLate: number;
    weLateTheyFine: number;
    weOnTimeTheyNot: number;
  };
}) {
  const cells = [
    { k: "a", v: data.bothOnTime, tone: "success" as const, note: "all good" },
    {
      k: "b",
      v: data.weOnTimeTheyNot,
      tone: "danger" as const,
      note: "transit is invisible to us",
    },
    {
      k: "c",
      v: data.weLateTheyFine,
      tone: "warning" as const,
      note: "our deadline is too tight",
    },
    {
      k: "d",
      v: data.bothLate,
      tone: "danger" as const,
      note: "genuinely late",
    },
  ];
  const max = Math.max(...cells.map((c) => c.v), 1);
  return (
    <div className="px-4 pb-5 sm:px-5">
      <div className="mb-2 grid grid-cols-[76px_1fr_1fr] gap-2 text-[11.5px] font-medium text-text-3">
        <span />
        <span className="text-center">Customer happy</span>
        <span className="text-center">Customer not</span>
      </div>
      <div className="grid grid-cols-[76px_1fr_1fr] gap-2">
        <span className="flex items-center justify-end text-right text-[11.5px] font-medium text-text-3">
          We hit our deadline
        </span>
        <QuadCell c={cells[0]} max={max} />
        <QuadCell c={cells[1]} max={max} />
        <span className="flex items-center justify-end text-right text-[11.5px] font-medium text-text-3">
          We missed it
        </span>
        <QuadCell c={cells[2]} max={max} />
        <QuadCell c={cells[3]} max={max} />
      </div>
    </div>
  );
}

function QuadCell({
  c,
  max,
}: {
  c: { v: number; note: string; tone: "success" | "warning" | "danger" };
  max: number;
}) {
  const strength = c.v === 0 ? 0 : 0.1 + (c.v / max) * 0.24;
  const colour =
    c.tone === "success"
      ? "var(--status-green)"
      : c.tone === "warning"
        ? "var(--status-amber)"
        : "var(--status-red)";
  return (
    <div
      className={cn(
        "rounded-[10px] border px-2 py-3.5 text-center transition-all",
        c.v > 0 && c.v === max
          ? "border-transparent shadow-sm"
          : "border-border",
      )}
      style={{
        background: `color-mix(in oklab, ${colour} ${strength * 100}%, var(--surface))`,
        ...(c.v > 0 && c.v === max
          ? {
              boxShadow: `0 0 0 2px color-mix(in oklab, ${colour} 35%, transparent)`,
            }
          : {}),
      }}
    >
      <div className="num text-[24px] leading-none font-bold text-text-1">
        {c.v}
      </div>
      <div className="mt-1.5 text-[11px] leading-tight text-text-3">
        {c.note}
      </div>
    </div>
  );
}

/**
 * Ranked horizontal bars with the number on the end — the default for
 * anything that is "how many of each". It's the one chart shape nobody has
 * to be taught, and it never hides the number behind a shape.
 */
export function CountBars({
  rows,
  tone = "danger",
  outOf,
  suffix,
}: {
  rows: { key: string; label: string; value: number }[];
  tone?: "accent" | "danger" | "warning" | "success";
  /** Fixed scale, e.g. 5 for a rating — otherwise bars scale to the largest. */
  outOf?: number;
  suffix?: string;
}) {
  const max = outOf ?? Math.max(...rows.map((r) => r.value), 1);
  const bar = {
    accent: "bg-primary",
    danger: "bg-status-red",
    warning: "bg-status-amber",
    success: "bg-status-green",
  }[tone];
  return (
    <div className="flex flex-col justify-center gap-2.5 px-4 pb-5 sm:px-5">
      {rows.map((r) => (
        <div
          key={r.key}
          className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-surface-2"
        >
          <span
            className="w-[116px] shrink-0 truncate text-[12.5px] font-medium text-text-1"
            title={r.label}
          >
            {r.label}
          </span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <span
              className={cn(
                "block h-full rounded-full transition-all duration-500",
                bar,
              )}
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
            />
          </span>
          <span className="w-11 shrink-0 text-right num text-[13px] font-semibold text-text-1">
            {outOf ? r.value.toFixed(1) : formatCount(r.value)}
            {suffix ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

// TOKENS, not hexes — docs/SCREENS.md §7.6.4 and docs/DESIGN.md are both
// emphatic: a literal colour here is invisible in one of the two themes. The
// spec's `line-strong` for "not required" is this app's `--border-strong`; the
// hardcoded `rgba(255,255,255,0.15)` it replaced simply vanished in light mode.
export const CHART_COLOURS = {
  due: "var(--text-3)",
  // `progress` is `--status-blue` rather than the accent, so the "In progress"
  // segment matches the "In progress" StatusPill beside it in every table.
  progress: "var(--status-blue)",
  done: "var(--status-green)",
  unreachable: "var(--status-amber)",
  notRequired: "var(--border-strong)",
} as const;

/**
 * The monthly rating trend — a hand-rolled inline SVG line, not Recharts.
 * See the file header: this is the one chart the source app used a charting
 * library for, and one graph doesn't earn a new dependency here (the Orders
 * dashboard's pipeline bars made the same call, CSS-only).
 */
export function RatingTrendLine({
  trend,
}: {
  trend: { month: string; avg: number; n: number }[];
}) {
  if (trend.length === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center px-4 text-[12.5px] text-text-3 sm:px-5">
        No rated calls in this window yet.
      </div>
    );
  }

  const W = 560;
  const H = 140;
  const PAD_X = 8;
  const PAD_TOP = 14;
  const PAD_BOTTOM = 22;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const plotW = W - PAD_X * 2;
  const MIN = 1;
  const MAX = 5;

  const x = (i: number) =>
    trend.length === 1
      ? PAD_X + plotW / 2
      : PAD_X + (i / (trend.length - 1)) * plotW;
  const y = (v: number) => PAD_TOP + plotH - ((v - MIN) / (MAX - MIN)) * plotH;

  const points = trend.map((t, i) => ({ x: x(i), y: y(t.avg), t }));
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const area = `${path} L${points[points.length - 1].x.toFixed(1)},${(PAD_TOP + plotH).toFixed(1)} L${points[0].x.toFixed(1)},${(PAD_TOP + plotH).toFixed(1)} Z`;

  return (
    <div className="px-4 pb-5 sm:px-5">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Monthly average rating trend"
      >
        {[1, 2, 3, 4, 5].map((v) => (
          <line
            key={v}
            x1={PAD_X}
            x2={W - PAD_X}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}
        <path d={area} fill="var(--primary)" fillOpacity={0.08} stroke="none" />
        <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--primary)" />
        ))}
        {points.map((p, i) => (
          <text
            key={`label-${i}`}
            x={p.x}
            y={H - 4}
            textAnchor={
              i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"
            }
            fontSize={10}
            fill="var(--text-3)"
          >
            {p.t.month}
          </text>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-text-3">
        {trend.map((t) => (
          <span key={t.month}>
            {t.month}:{" "}
            <span className="num text-text-1">{t.avg.toFixed(2)}</span> ({t.n})
          </span>
        ))}
      </div>
    </div>
  );
}
