import * as React from "react";

import type { Kpi, Matrix } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

/**
 * The furniture the two dashboards are laid out with. Server components — no
 * state, no handlers — so only the charts themselves cross into the browser
 * bundle.
 */

export function Card({
  title,
  sub,
  note,
  className,
  children,
}: {
  title: string;
  sub?: React.ReactNode;
  note?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-card border border-border bg-surface p-4",
        className,
      )}
    >
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[14px] font-bold text-text-1">{title}</h2>
        {sub && <span className="num text-[12px] text-text-3">{sub}</span>}
      </header>
      <div className="min-w-0 flex-1">{children}</div>
      {note && (
        <p className="mt-3 text-[11.5px] leading-snug text-text-3">{note}</p>
      )}
    </section>
  );
}

const TONE: Record<string, string> = {
  good: "text-status-green",
  bad: "text-status-red",
  warn: "text-status-amber",
  neutral: "text-text-1",
};

/**
 * The figure strip. `deltaPct` draws an arrow whose COLOUR depends on
 * `lowerIsBetter` — days late falling is green, order value falling is red —
 * and the figure itself never carries a sign, because the arrow already says
 * the direction and "fell −68.3%" is a double negative.
 */
export function KpiStrip({
  kpis,
  className,
}: {
  kpis: Kpi[];
  /** Overrides the default column count — e.g. for a narrow sidebar beside a
   * chart, where six-across would squeeze every figure onto its own line. */
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6",
        className,
      )}
    >
      {kpis.map((k) => {
        const up = (k.deltaPct ?? 0) > 0;
        const good = k.lowerIsBetter ? !up : up;
        return (
          <div
            key={k.label}
            className="flex min-w-0 flex-col rounded-card border border-border bg-surface px-3.5 py-3"
          >
            <span className="truncate text-[11px] font-semibold tracking-[0.04em] text-text-3 uppercase">
              {k.label}
            </span>
            <span
              className={cn(
                "num mt-1.5 text-[19px] leading-none font-bold",
                TONE[k.tone ?? "neutral"] ?? "text-text-1",
              )}
            >
              {k.value}
            </span>
            <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] leading-snug text-text-3">
              {k.deltaPct != null && (
                <span
                  className={cn(
                    "num font-semibold",
                    good ? "text-status-green" : "text-status-red",
                  )}
                >
                  {up ? "▲" : "▼"} {Math.abs(k.deltaPct).toFixed(1)}%
                </span>
              )}
              {k.sub}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Insights({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((t) => (
        <li
          key={t}
          className="flex gap-2.5 text-[13px] leading-relaxed text-text-2"
        >
          <span
            aria-hidden="true"
            className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary"
          />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The small print, and it is not decoration: a caveat nobody reads is a caveat
 * that did not happen. The same sentences ride on the Notes sheet of the
 * workbook, so a figure never means one thing on screen and another in a file.
 */
export function Caveats({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((t) => (
        <li key={t} className="text-[11.5px] leading-relaxed text-text-3">
          {t}
        </li>
      ))}
    </ul>
  );
}

/**
 * The month grid — who ordered, and when. The one shape that answers "did this
 * customer stop in August" without anybody building a pivot. Shaded by how big
 * the cell is against the biggest cell in the grid; an empty month is left
 * blank rather than printed as a zero, because "did not order" and "ordered
 * nothing" are the same fact and a 0 makes it look measured.
 */
export function HeatGrid({ matrix }: { matrix: Matrix }) {
  const peak = Math.max(
    1,
    ...matrix.rows.flatMap((r) => r.values.map((v) => (v == null ? 0 : v))),
  );
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[520px] border-separate border-spacing-[3px]">
        <thead>
          <tr>
            <th className="w-[38%] px-1 pb-1 text-left text-[11px] font-semibold text-text-3">
              &nbsp;
            </th>
            {matrix.columns.map((c) => (
              <th
                key={c}
                className="px-1 pb-1 text-center text-[11px] font-semibold whitespace-nowrap text-text-3"
              >
                {c}
              </th>
            ))}
            <th className="px-1 pb-1 text-right text-[11px] font-semibold text-text-3">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((r) => (
            <tr key={r.label}>
              <td
                className="max-w-0 truncate pr-2 text-[12px] text-text-2"
                title={r.label}
              >
                {r.label}
              </td>
              {r.values.map((v, i) => (
                <td
                  key={matrix.columns[i]}
                  className="num rounded-[4px] px-1.5 py-1.5 text-center text-[11.5px] text-text-1"
                  style={{
                    background:
                      v == null || v === 0
                        ? "var(--chip)"
                        : `color-mix(in oklab, var(--chart-1) ${Math.round((v / peak) * 78) + 8}%, transparent)`,
                  }}
                >
                  {v == null || v === 0 ? "" : shortNum(v, matrix.format)}
                </td>
              ))}
              <td className="num px-1.5 text-right text-[11.5px] font-semibold text-text-1">
                {r.totalDisplay}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function shortNum(v: number, format: "money" | "count"): string {
  if (format === "count") return v.toLocaleString("en-IN");
  if (v >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(1)}L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
  return String(Math.round(v));
}
