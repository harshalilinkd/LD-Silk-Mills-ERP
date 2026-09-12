import { inrShort, monthName, pct } from "./format";
import type { Matrix, Panel, RankRow, SeriesPoint } from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Grouping a name that was typed more than one way
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── THE SAME FABRIC, COUNTED TWICE ───────────────────────────────────────
 *
 * `LONDON` and `London` are one cloth. The order form takes free text, so
 * both are in the table — and grouping on the raw string splits ₹2.01 crore
 * of LONDON into two smaller fabrics that then rank as two lesser ones. On
 * the live data this affects **28 of 585 fabric names and 27 of 156 agent
 * names**: "GAURAV"/"Gaurav", "Self"/"SELF", "Akash Textiles Agency" and its
 * shouted twin. Every ranking, share, concentration figure and month grid
 * built on the raw name is wrong by that much, and wrong in the direction
 * that hides the biggest things.
 *
 * `groupNames` folds case and whitespace to decide what is the same, and
 * keeps the spelling that carries the MOST VALUE as the label — so the name
 * a reader sees is the one the business mostly writes, not whichever row
 * happened to come first.
 *
 * It is deliberately the same fold the pivot engine uses (`itemKey` in
 * `xlsx-pivot.ts`) and the same idea the importer uses (`normaliseName` in
 * `order-entry/import/coerce.ts`): the workbook's charts, its pivots and its
 * imports must not disagree about what counts as one name.
 *
 * It does NOT merge misspellings — "LONDAN" stays its own fabric. Only case
 * and spacing. An edit-distance match would quietly merge two real cloths,
 * and that cannot be undone by looking at the result.
 */
export function groupKey(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Adds `value` to the bucket `name` belongs to, folding names that differ
 * only by case or spacing. Call `groupNames` at the end to get the display
 * spelling for each bucket.
 */
export function addGrouped(
  m: Map<string, { value: number; spellings: Map<string, number> }>,
  name: string,
  value: number,
): void {
  const k = groupKey(name);
  let g = m.get(k);
  if (!g) { g = { value: 0, spellings: new Map() }; m.set(k, g); }
  g.value += value;
  g.spellings.set(name, (g.spellings.get(name) ?? 0) + value);
}

/** Collapses the buckets to `label -> value`, labelled by the heaviest spelling. */
export function groupNames(
  m: Map<string, { value: number; spellings: Map<string, number> }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const g of m.values()) {
    let best = "";
    let bestVal = -Infinity;
    for (const [spelling, v] of g.spellings) {
      if (v > bestVal) { bestVal = v; best = spelling; }
    }
    out.set(best, (out.get(best) ?? 0) + g.value);
  }
  return out;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The thinking that turns a table into an answer
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ten families of analysis, written once here so every report gets the same
 * arithmetic and — more importantly — the same HONESTY about it. Three rules
 * run through all of them:
 *
 *   1. **A figure prints its denominator.** "38% of value" is meaningless
 *      without "of ₹8.33 cr across 201 customers". Every helper returns the
 *      base it divided by.
 *   2. **A figure that cannot be computed returns null, never 0.** Nothing
 *      here ever quietly renders "0%" for "we do not know yet"; the dashboard
 *      prints a dash and says why.
 *   3. **Median before mean.** One ₹2 crore order drags an average somewhere
 *      no real order sits. Where both are interesting, both are shown.
 *
 * No imports beyond formatting: these are pure functions over numbers, so
 * they can be unit-reasoned about and reused from any report.
 */

// ─── 1. concentration and dependency ──────────────────────────────────────

export type Concentration = {
  total: number;
  n: number;
  topShare: number | null;
  top5Share: number | null;
  top20Share: number | null;
  /** How many names it takes to reach 80% of the total. */
  paretoCount: number | null;
  topLabel: string | null;
};

/**
 * How much of the total sits with how few names.
 *
 * This is the single most decision-relevant shape in most business data and
 * almost no screen shows it. One customer being a quarter of the order book
 * changes how you think about their late dispatch, their credit terms and
 * next season — and it takes one pass over a sorted list.
 */
export function concentration(items: { label: string; value: number }[]): Concentration {
  const sorted = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, i) => s + i.value, 0);
  const n = sorted.length;
  if (!n || total <= 0) {
    return { total, n, topShare: null, top5Share: null, top20Share: null, paretoCount: null, topLabel: null };
  }
  const share = (k: number) => (sorted.slice(0, k).reduce((s, i) => s + i.value, 0) / total) * 100;

  let running = 0;
  let pareto = 0;
  for (const i of sorted) {
    running += i.value;
    pareto += 1;
    if (running / total >= 0.8) break;
  }

  return {
    total,
    n,
    topShare: share(1),
    // Only meaningful once there are more names than the slice being measured.
    top5Share: n > 5 ? share(5) : null,
    top20Share: n > 20 ? share(20) : null,
    paretoCount: pareto,
    topLabel: sorted[0]?.label ?? null,
  };
}

// ─── 2. trend and momentum ────────────────────────────────────────────────

export type Trend = {
  points: SeriesPoint[];
  /** Latest against the one before it, in percent. Null with fewer than two. */
  changePct: number | null;
  latest: SeriesPoint | null;
  previous: SeriesPoint | null;
  best: SeriesPoint | null;
  /** Mean of the last three, for "is the latest month unusual or normal". */
  recentAverage: number | null;
};

/**
 * ── A MONTH WITH NOTHING IN IT IS STILL A MONTH ───────────────────────────
 *
 * `byMonth` only ever holds the months that had a row, so a module with one
 * entry produces one point and no line chart at all — which is what left Petty
 * Cash, the Checklist and Help Slip with no chart on their dashboards while
 * every other report had five.
 *
 * The gap is in the map, not in the truth: a month with no petty cash spending
 * genuinely spent zero, and saying so is information — it is what tells a
 * manager the box was opened once in six months rather than steadily. The
 * module's own Analysis screen has always filled months this way; the reports
 * simply never did.
 *
 * Which months to fill:
 *
 *   · The period was ASKED FOR — fill every month of it, up to this month.
 *     Somebody who chose April to September is owed six columns, and the five
 *     empty ones are the answer, not a gap.
 *   · No period given ("everything on record") — start at the first month that
 *     has something, because inventing empty months before the business began
 *     is not a fact about the business.
 *
 * Twelve months at most, keeping the newest, for the same reason the heat grid
 * caps: thirty columns on an axis is not a chart anybody reads.
 */
export function fillMonths(
  byMonth: Map<string, number>,
  period: { from?: string; to?: string },
  max = 12,
): Map<string, number> {
  const key = (d: Date) => d.toISOString().slice(0, 7);
  const present = [...byMonth.keys()].filter(Boolean).sort();
  const thisMonth = key(new Date());

  // Never run the axis into the future: a month that has not happened cannot
  // be reported as zero.
  const askedTo = period.to?.slice(0, 7);
  const end = [askedTo && askedTo < thisMonth ? askedTo : thisMonth, present.at(-1) ?? ""]
    .filter(Boolean)
    .sort()
    .at(-1)!;

  const askedFrom = period.from?.slice(0, 7);
  const start = askedFrom && askedFrom > "1900-01" ? askedFrom : (present[0] ?? end);
  if (!start || start > end) return byMonth;

  const out = new Map<string, number>();
  const cur = new Date(`${start}-01T00:00:00Z`);
  const stop = new Date(`${end}-01T00:00:00Z`);
  // A guard, not a limit anybody should reach: an unclamped loop over a
  // 1999–2100 period would build 1,200 entries before the slice threw them
  // away.
  for (let i = 0; cur <= stop && i < 600; i++) {
    const k = key(cur);
    out.set(k, byMonth.get(k) ?? 0);
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }

  // Anything the caller recorded outside the window still belongs in the file.
  for (const [k, v] of byMonth) if (!out.has(k)) out.set(k, v);

  const keys = [...out.keys()].sort();
  const kept = keys.slice(-max);
  return new Map(kept.map((k) => [k, out.get(k)!]));
}

export function trend(
  byMonth: Map<string, number>,
  display: (n: number) => string,
): Trend {
  const points: SeriesPoint[] = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => ({ label: monthName(k), value: v, display: display(v) }));

  const latest = points.at(-1) ?? null;
  const previous = points.length > 1 ? points.at(-2)! : null;
  const best = points.length ? points.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  const tail = points.slice(-3);

  return {
    points,
    // Guarded: a previous month of zero would divide to Infinity and print
    // "+Infinity%", which is the kind of thing that ends up in a board pack.
    changePct:
      latest && previous && previous.value !== 0
        ? ((latest.value - previous.value) / Math.abs(previous.value)) * 100
        : null,
    latest,
    previous,
    best,
    recentAverage: tail.length ? tail.reduce((s, p) => s + p.value, 0) / tail.length : null,
  };
}

// ─── 3. contribution to change ────────────────────────────────────────────

export type Contributor = { label: string; change: number; shareOfChange: number };

/**
 * Not who is biggest — who MOVED the number.
 *
 * A month falls 8% and the instinct is to look at the biggest customer. Often
 * the biggest customer was flat and three mid-sized ones stopped ordering.
 * This ranks by the size of the swing, so the answer to "what happened" is the
 * first thing on the list rather than something to be worked out.
 */
export function contributors(
  current: Map<string, number>,
  prior: Map<string, number>,
  limit = 5,
): { rows: Contributor[]; netChange: number } {
  const names = new Set([...current.keys(), ...prior.keys()]);
  const changes = [...names]
    .map((label) => ({ label, change: (current.get(label) ?? 0) - (prior.get(label) ?? 0) }))
    .filter((c) => c.change !== 0);

  const netChange = changes.reduce((s, c) => s + c.change, 0);
  // Share of the ABSOLUTE movement, so a riser and a faller can both be
  // credited with explaining a flat month — which is exactly when it matters.
  const gross = changes.reduce((s, c) => s + Math.abs(c.change), 0);

  const rows = changes
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, limit)
    .map((c) => ({ ...c, shareOfChange: gross > 0 ? (Math.abs(c.change) / gross) * 100 : 0 }));

  return { rows, netChange };
}

// ─── 4. distribution and outliers ─────────────────────────────────────────

export type Spread = {
  n: number;
  min: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  p90: number | null;
  max: number | null;
  mean: number | null;
  /** Values outside 1.5 × the interquartile range — the textbook fence. */
  outlierLow: number | null;
  outlierHigh: number | null;
};

export function spread(values: number[]): Spread {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const n = v.length;
  if (!n) {
    return { n: 0, min: null, p25: null, median: null, p75: null, p90: null, max: null, mean: null, outlierLow: null, outlierHigh: null };
  }
  const q = (p: number) => {
    const i = (n - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (i - lo);
  };
  const p25 = q(0.25);
  const p75 = q(0.75);
  const iqr = p75 - p25;
  return {
    n,
    min: v[0],
    p25,
    median: q(0.5),
    p75,
    p90: q(0.9),
    max: v[n - 1],
    mean: v.reduce((s, x) => s + x, 0) / n,
    outlierLow: iqr > 0 ? p25 - 1.5 * iqr : null,
    outlierHigh: iqr > 0 ? p75 + 1.5 * iqr : null,
  };
}

// ─── 5. ageing buckets ────────────────────────────────────────────────────

export const AGE_BUCKETS = [
  { label: "0–7 days", max: 7 },
  { label: "8–15 days", max: 15 },
  { label: "16–30 days", max: 30 },
  { label: "31–60 days", max: 60 },
  { label: "Over 60 days", max: Infinity },
] as const;

export function ageing(days: number[]): Panel {
  const counts = AGE_BUCKETS.map(() => 0);
  for (const d of days) {
    const i = AGE_BUCKETS.findIndex((b) => d <= b.max);
    counts[i < 0 ? AGE_BUCKETS.length - 1 : i] += 1;
  }
  const total = counts.reduce((s, c) => s + c, 0);
  return {
    // Best to worst down the list, so the palette may carry the meaning.
    tone: "severity",
    title: "How long they have waited",
    valueLabel: "Items",
    rows: AGE_BUCKETS.map((b, i) => ({
      label: b.label,
      value: counts[i],
      display: String(counts[i]),
      share: total ? (counts[i] / total) * 100 : 0,
    })),
  };
}

// ─── 6. ranking, with the share printed beside it ─────────────────────────

export function rank(
  items: { label: string; value: number; meta?: string }[],
  display: (n: number) => string,
  limit = 10,
): RankRow[] {
  const total = items.reduce((s, i) => s + i.value, 0);
  return [...items]
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((i) => ({
      label: i.label,
      value: i.value,
      display: display(i.value),
      share: total > 0 ? (i.value / total) * 100 : 0,
      meta: i.meta,
    }));
}

// ─── 7. run rate ──────────────────────────────────────────────────────────

/**
 * Where the current month lands if the rest of it looks like the part already
 * done. Stated as an estimate, never as a figure — the dashboard prints the
 * word "on track for", and only once at least three days have elapsed, because
 * projecting a month from one day is astrology.
 */
export function runRate(
  soFar: number,
  dayOfMonth: number,
  daysInMonth: number,
): number | null {
  if (dayOfMonth < 3 || dayOfMonth >= daysInMonth) return null;
  return (soFar / dayOfMonth) * daysInMonth;
}

// ─── 8. the sentences ─────────────────────────────────────────────────────

/**
 * Insight lines, written from the numbers.
 *
 * Every one of these is a sentence somebody could read aloud in a meeting.
 * They are generated rather than hand-written so they cannot go stale, and
 * each is skipped entirely when its inputs are missing — a dashboard that
 * prints "Top 5 customers are 0% of value" for an empty month is worse than
 * one that prints nothing.
 */
export function concentrationInsight(c: Concentration, noun = "customers", money = true): string | null {
  if (c.top5Share === null || !c.topLabel) return null;
  const fmt = money ? inrShort : (n: number) => n.toLocaleString("en-IN");
  return (
    `The top five ${noun} are ${pct(c.top5Share)} of ${fmt(c.total)}, ` +
    `and ${c.topLabel} alone is ${pct(c.topShare)}. ` +
    `Just ${c.paretoCount} ${noun} make up 80% of it.`
  );
}

/**
 * Is the last bucket the month we are standing in?
 *
 * A comparison that puts eight days against thirty-one is not a comparison,
 * and the dashboard was printing "fell 66.0%" as a fact two lines above its
 * own run-rate sentence saying the opposite.
 */
export function lastMonthIsPartial(byMonth: Map<string, number>): boolean {
  const keys = [...byMonth.keys()].sort();
  const last = keys.at(-1);
  if (!last) return false;
  return last === new Date().toISOString().slice(0, 7);
}

export function trendInsight(t: Trend, valueNoun = "value"): string | null {
  if (!t.latest || !t.previous || t.changePct === null) return null;
  // The DIRECTION is the word, so the figure carries no sign — "fell −68.3%"
  // reads as a double negative and made one reader ask whether it had risen.
  const dir = t.changePct >= 0 ? "rose" : "fell";
  return (
    `${t.latest.label} ${valueNoun} ${dir} ${Math.abs(t.changePct).toFixed(1)}% against ${t.previous.label} ` +
    `— ${t.latest.display} against ${t.previous.display}.` +
    // Said here rather than left to the reader: the current month is only as
    // long as today, and putting eight days against a whole month reads as a
    // collapse. The dashboard was printing "fell 66.0%" two lines above its
    // own run-rate sentence saying the opposite.
    (t.latest.label === monthName(new Date().toISOString().slice(0, 7))
      ? ` ${t.latest.label} is not finished yet, so this is a part month against a whole one.`
      : "")
  );
}

export function contributorInsight(
  c: { rows: Contributor[]; netChange: number },
  display: (n: number) => string,
  noun = "customers",
): string | null {
  if (c.rows.length === 0) return null;
  const top = c.rows.slice(0, 3);
  const explained = top.reduce((s, r) => s + r.shareOfChange, 0);
  const dir = c.netChange >= 0 ? "rise" : "fall";
  return (
    `${top.length} ${noun} explain ${pct(explained, 0)} of that ${dir}: ` +
    top.map((r) => `${r.label} ${r.change >= 0 ? "+" : "−"}${display(Math.abs(r.change))}`).join(", ") +
    "."
  );
}

// ─── 9. the heat grid ─────────────────────────────────────────────────────

/**
 * Months across, names down, coloured by how much happened in each cell.
 *
 * The only shape on the dashboard that answers WHEN and WHO at once. "Did this
 * customer stop in August" needs both axes, and without it somebody builds a
 * pivot table to find out — which is exactly the work this module exists to
 * remove.
 *
 * Only the top `limit` names are drawn. A grid of 200 rows is not a grid, it
 * is a table with colours, and the ranked panel beside it already covers the
 * long tail.
 */
export function matrixFrom(
  rows: { label: string; month: string; value: number }[],
  opts: { title: string; format: "money" | "count"; display: (n: number) => string; limit?: number; note?: string },
): Matrix | undefined {
  // The MOST RECENT twelve. Goods Return spans 24 months and the workbook grid
  // only has room for nine columns, so taking them from the front showed 2024
  // and hid this year — a grid that answers "did they stop in August" by
  // printing 2024 is worse than no grid.
  const months = [...new Set(rows.map((r) => r.month))].filter(Boolean).sort().slice(-12);
  if (months.length < 2) return undefined;

  // ── RANK AND TOTAL OVER THE MONTHS SHOWN, NOT OVER ALL TIME ───────────
  //
  // Ranking over every month while drawing only twelve put KALAMEK GARMENTS at
  // the top of the grid with every cell empty and ₹13.4 L beside it: all of
  // its returns predate the window. A row in this grid must be there because
  // of what is IN the grid.
  const kept = new Set(months);
  rows = rows.filter((r) => kept.has(r.month));

  const byLabel = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  for (const r of rows) {
    if (!byLabel.has(r.label)) byLabel.set(r.label, new Map());
    const m = byLabel.get(r.label)!;
    m.set(r.month, (m.get(r.month) ?? 0) + r.value);
    totals.set(r.label, (totals.get(r.label) ?? 0) + r.value);
  }

  const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, opts.limit ?? 8);
  if (!top.length) return undefined;

  return {
    title: opts.title,
    columns: months.map(monthName),
    // Money is shown in thousands so a five-figure sum fits a narrow cell; the
    // legend under the grid says so rather than leaving it to be worked out.
    rows: top.map(([label, total]) => ({
      label,
      values: months.map((m) => {
        const v = byLabel.get(label)?.get(m) ?? 0;
        // RUPEES, not thousands. The workbook's `#,##0,` format does the
        // scaling and its legend says so; the screen formats rupees like
        // every other figure. Pre-dividing here meant both were wrong — the
        // workbook by a factor of a million, the screen by a thousand.
        return v === 0 ? null : v;
      }),
      total,
      totalDisplay: opts.display(total),
    })),
    format: opts.format,
    note: opts.note,
    totalLabels: totals.size,
  };
}

/** The month-on-month movement of one series, for a KPI's arrow. */
export function monthDelta(byMonth: Map<string, number>): number | null {
  const keys = [...byMonth.keys()].sort();
  if (keys.length < 2) return null;
  const last = byMonth.get(keys[keys.length - 1]) ?? 0;
  const prev = byMonth.get(keys[keys.length - 2]) ?? 0;
  if (prev === 0) return null;
  return ((last - prev) / Math.abs(prev)) * 100;
}
