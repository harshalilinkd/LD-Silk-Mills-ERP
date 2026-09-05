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
        // BOTH TONES ARE GREY, and that is a deliberate correction.
        //
        // `warn` used to be amber, and on a page of otherwise calm figures two
        // amber banners read as "the system is broken". They are not errors.
        // They are notes explaining why a figure is not what somebody would
        // expect — that the actual transport cost is being copied rather than
        // entered, and that the average transit time is built from 98 of 277
        // returns. Every one of those is a fact about how the WORK is recorded,
        // not a fault in the software, and shouting about it made the whole
        // report look unwell.
        //
        // The distinction is kept in the markup rather than deleted: `warn`
        // gets a slightly stronger left edge and darker text, so it still reads
        // as the more important of the two if they ever appear together, and a
        // future genuine error has somewhere to go.
        tone === "warn"
          ? "border-border-strong border-l-[3px] bg-surface-2 text-text-2"
          : "border-border bg-surface-2 text-text-3",
      )}
    >
      <IconInfoCircle
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "warn" ? "text-text-2" : "text-text-3",
        )}
      />
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
/**
 * `tone="amber"` is the ONE piece of alarm colour left on this page, and it is
 * spent on the ageing buckets — 64 returns sitting over 30 days is the only
 * figure here somebody can act on today. Everything else is descriptive, so it
 * is grey. Colour that appears everywhere stops meaning anything.
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
