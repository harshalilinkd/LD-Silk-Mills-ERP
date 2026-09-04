import { IconInfoCircle } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

/**
 * The pieces the Reports screen is built from.
 *
 * One idea runs through all of them: **a figure and its coverage travel
 * together**. Every number on that screen is computed from a subset of the 341
 * returns — the average transit time from 98 of them, the billing total from
 * 315 — and a figure printed without saying which subset is a figure somebody
 * will quote in a meeting as if it were the whole picture. So `Figure` has a
 * `caveat` slot that sits under the number, and it is used rather than
 * decorative.
 */

export function Section({
  title,
  lede,
  children,
  action,
}: {
  title: string;
  lede?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-[14.5px] font-bold text-text-1">{title}</h2>
          {lede && <p className="mt-0.5 text-[12.5px] text-text-3">{lede}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Figure({
  label,
  value,
  caveat,
  tone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  caveat?: React.ReactNode;
  tone?: "good" | "warn" | "bad";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[11px] font-medium tracking-[0.02em] text-text-3 uppercase">
        {label}
      </div>
      <div
        className={cn(
          "num mt-0.5 text-[19px] leading-tight font-bold tracking-[-0.01em]",
          tone === "good" && "text-status-green",
          tone === "warn" && "text-status-amber",
          tone === "bad" && "text-status-red",
          !tone && "text-text-1",
        )}
      >
        {value}
      </div>
      {caveat && (
        <div className="mt-0.5 text-[11.5px] leading-snug text-text-3">
          {caveat}
        </div>
      )}
    </div>
  );
}

/** A figure that could not be computed, saying why instead of showing 0. */
export function NotMeasurable({ reason }: { reason: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 text-[14px] font-semibold text-text-3">
      Not measurable
      <span className="text-[11.5px] font-normal">({reason})</span>
    </span>
  );
}

export function Note({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "warn";
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-field border px-3 py-2 text-[12.5px] leading-relaxed",
        tone === "warn"
          ? "border-status-amber/30 bg-status-amber-dim text-status-amber"
          : "border-border bg-surface-2 text-text-2",
      )}
    >
      <IconInfoCircle className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0">{children}</p>
    </div>
  );
}

/**
 * A horizontal bar per row, scaled to the largest value in the set.
 *
 * Used for the ageing buckets and the reason breakdown. The bar is the width,
 * the number is the truth: the label always carries the exact figure, so the
 * bar never has to be measured by eye to be read.
 */
export function Bars({
  rows,
  tone = "accent",
}: {
  rows: { key: string; label: string; n: number; sub?: React.ReactNode }[];
  tone?: "accent" | "amber";
}) {
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[12.5px] font-medium text-text-1">
              {r.label}
            </span>
            <span className="num shrink-0 text-[12.5px] font-semibold text-text-1">
              {r.n.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-pill bg-chip">
            <div
              className={cn(
                "h-full rounded-pill",
                tone === "amber" ? "bg-status-amber" : "bg-primary",
              )}
              style={{ width: `${Math.max((r.n / max) * 100, r.n > 0 ? 3 : 0)}%` }}
            />
          </div>
          {r.sub && (
            <span className="text-[11.5px] text-text-3">{r.sub}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
