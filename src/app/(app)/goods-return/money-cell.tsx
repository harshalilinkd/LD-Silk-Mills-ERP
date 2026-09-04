import { cn } from "@/lib/utils";

/**
 * A rupee figure in a table cell, or an honest dash.
 *
 * Two things it exists to get right, both of which the reference screens get
 * wrong in places:
 *
 *   · NULL IS NOT ZERO. 26 of the 341 live returns have no billing amount and
 *     129 have no transport figure. Printing those as ₹0.00 states that
 *     somebody was charged nothing, which is a different claim from "nobody
 *     wrote it down". They render as an em dash.
 *   · Indian grouping and tabular figures. `en-IN` gives 1,23,456.00 rather
 *     than 123,456.00, and `.num` (see globals.css) keeps the digits
 *     monospaced so a column of amounts lines up on the decimal instead of
 *     staggering — on a screen that is mostly money, this is the difference
 *     between a table you can scan and one you have to read.
 *
 * Values arrive as STRINGS: postgres.js returns every `numeric` that way, and
 * converting them early is how paise get lost. The conversion happens here, at
 * the point of display, and nowhere upstream.
 */
export function MoneyCell({
  value,
  className,
  dash = "—",
}: {
  value: string | number | null | undefined;
  className?: string;
  dash?: string;
}) {
  if (value === null || value === undefined || value === "") {
    return <span className={cn("text-text-3", className)}>{dash}</span>;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return <span className={cn("text-text-3", className)}>{dash}</span>;
  }
  return (
    <span className={cn("num", className)}>
      ₹{n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

/** The same rules for a plain quantity — metres, pieces — with no currency. */
export function QtyCell({
  value,
  unit,
  className,
}: {
  value: string | number | null | undefined;
  unit?: string;
  className?: string;
}) {
  if (value === null || value === undefined || value === "") {
    return <span className={cn("text-text-3", className)}>—</span>;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return <span className={cn("text-text-3", className)}>—</span>;
  }
  return (
    <span className={cn("num", className)}>
      {n.toLocaleString("en-IN", { maximumFractionDigits: 3 })}
      {unit ? <span className="text-text-3"> {unit}</span> : null}
    </span>
  );
}
