import type { IsoDate } from "@/lib/dates";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  What a report IS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One definition drives everything: the picker on screen, the permission
 * check, the SQL, the CSV, and the Excel workbook with its dashboard. A
 * report is added by writing one of these and registering it — no new screen,
 * no new route, no new export code.
 *
 * ── COLUMNS ARE TYPED, AND THE TYPE IS THE WHOLE POINT ───────────────────
 *
 * `type` is not decoration. It decides the CSV's shape (a money column is a
 * bare number so Excel can add it up, a date is `YYYY-MM-DD` so every
 * spreadsheet on earth reads it the same way), the Excel number format, the
 * column alignment, and whether a column can be totalled at all. Getting it
 * right once here is why the two exporters need no per-report knowledge.
 *
 * ── ROWS ARE FLAT, ALWAYS ────────────────────────────────────────────────
 *
 * A report row is a plain object of primitives. No nesting, no arrays. If a
 * report wants a parent and its children, it repeats the parent — that is what
 * a spreadsheet can filter and pivot, and a spreadsheet is where these end up.
 */

export type ReportModule =
  | "order-entry"
  | "crm"
  | "goods-return"
  | "petty-cash"
  | "help-slip"
  | "checklist"
  | "cross";

export const MODULE_META: Record<ReportModule, { label: string; systemCode: string | null }> = {
  "order-entry": { label: "Orders", systemCode: "order-entry" },
  crm: { label: "CRM", systemCode: "crm" },
  "goods-return": { label: "Goods Return", systemCode: "goods-return-lr" },
  "petty-cash": { label: "Petty Cash", systemCode: "petty-cash" },
  "help-slip": { label: "Help Slip", systemCode: "help-slip" },
  checklist: { label: "Checklist", systemCode: "checklist" },
  // Spans several modules, so no single system grants it. See `authz.ts`.
  cross: { label: "Across the business", systemCode: null },
};

export type ColumnType =
  /** Anything that is words. Left aligned, never summed. */
  | "text"
  /** A whole count. Right aligned, `#,##0`. */
  | "int"
  /** A measured quantity — metres, pieces. Right aligned, two decimals. */
  | "number"
  /** Rupees. Right aligned, `#,##0.00`, and totalled at the foot. */
  | "money"
  /** A calendar day. `YYYY-MM-DD` in CSV, a real date cell in Excel. */
  | "date"
  /** A moment. Asia/Kolkata, because the server's clock is UTC. */
  | "datetime"
  /** Already a percentage — 38.3 means 38.3%, not 3830%. */
  | "percent"
  /** Yes / No. Never `true`, which reads as a formula to Excel. */
  | "boolean";

export type ReportColumn = {
  key: string;
  label: string;
  type: ColumnType;
  /** Excel column width in characters. Sensible defaults per type if omitted. */
  width?: number;
  /** Kept out of the default column set; the user can switch it on. */
  optional?: boolean;
  /** One line under the column name on the Notes sheet. */
  note?: string;
};

export type FilterKind = "dateRange" | "select" | "text";

export type ReportFilter = {
  key: string;
  label: string;
  kind: FilterKind;
  help?: string;
  /** For `select`. Resolved on the server when the picker is rendered. */
  options?: () => Promise<{ value: string; label: string }[]>;
};

/** What the browser sent, already validated. Dates are `YYYY-MM-DD`. */
export type ReportParams = {
  from?: IsoDate;
  to?: IsoDate;
  [key: string]: string | undefined;
};

export type ReportRow = Record<string, string | number | boolean | null>;

// ─── the analysis that rides along with the rows ──────────────────────────

export type Tone = "neutral" | "good" | "bad" | "warn";

export type Kpi = {
  label: string;
  value: string;
  tone?: Tone;
  /** A short line under the figure — its denominator, or what it is of. */
  sub?: string;
  /**
   * A movement against the period before, in percent. Drives an arrow beside
   * the figure. Null when there is nothing to compare with, which prints
   * nothing rather than a misleading 0%.
   */
  deltaPct?: number | null;
  /** True when going DOWN is the good direction — cancellations, days late. */
  lowerIsBetter?: boolean;
};

export type SeriesPoint = { label: string; value: number; display: string };

export type RankRow = {
  label: string;
  value: number;
  display: string;
  /** 0–100. Drives the bar length and the "% of total" column. */
  share?: number;
  /** A second figure beside it — a count beside a value, usually. */
  meta?: string;
};

/**
 * How a panel is DRAWN, which is a different question from what it contains.
 *
 * A pro dashboard does not repeat one chart eight times. Each of these answers
 * a different shape of question, and every one is native Excel — no images:
 *
 *   · `bar`    — ranking. "Who is biggest." Gradient data bars, live under a
 *                filter, one colour per panel from a rotating palette.
 *   · `share`  — composition. One 100%-wide row split into coloured segments,
 *                so "the top three are most of it" reads without arithmetic.
 *   · `funnel` — a sequence that only ever shrinks. Indented bars, each
 *                labelled with what fell away since the one above.
 *   · `split`  — a diverging measure. Bars run left for negative and right for
 *                positive from a shared centre, red and green.
 */
export type PanelKind = "bar" | "share" | "funnel" | "split";

export type Panel = {
  title: string;
  /** What the numbers are: "Value", "Returns", "Entries". */
  valueLabel: string;
  rows: RankRow[];
  kind?: PanelKind;
  /** One line under the panel saying what to take from it. */
  note?: string;
};

/**
 * A grid coloured by value — months across, categories down.
 *
 * The one shape that shows WHEN something happened as well as how much, and
 * the reason a report can answer "did this customer stop in August" without
 * anybody building a pivot. Drawn with Excel's own three-colour scale, so it
 * stays live.
 */
export type Matrix = {
  title: string;
  /** Column headings — months, usually. */
  columns: string[];
  rows: { label: string; values: (number | null)[]; total: number; totalDisplay: string }[];
  /** How a single cell is written out, for the legend line. */
  format: "money" | "count";
  note?: string;
};

/**
 * Everything the dashboard sheet draws, computed once when the report runs.
 *
 * `insights` are SENTENCES, not numbers. "Top five customers are 38% of the
 * book" is worth more to somebody reading on a phone than a pie chart they
 * have to interpret, and it is the one part of a workbook that survives being
 * pasted into WhatsApp.
 *
 * `caveats` are the honest small print — the period being reported, what is
 * excluded, and any figure in this workbook that means something narrower
 * than its name suggests. They go on the Notes sheet AND under the dashboard,
 * because a caveat nobody reads is a caveat that did not happen.
 */
export type ReportAnalysis = {
  kpis: Kpi[];
  /**
   * The headline series. `compare` draws a second, lighter series behind the
   * first — last year against this one, or metres behind value — which is how
   * a trend stops being a shape and starts being a comparison.
   */
  trend?: {
    title: string;
    valueLabel: string;
    points: SeriesPoint[];
    compare?: { label: string; points: SeriesPoint[] };
    /** Drawn as a dashed line across the columns. The period's own average. */
    averageLabel?: string;
  };
  panels: Panel[];
  matrix?: Matrix;
  insights: string[];
  caveats: string[];
  /** The one sentence somebody would repeat. Printed largest, at the top. */
  headline?: string;
};

export type ReportResult = {
  rows: ReportRow[];
  analysis: ReportAnalysis;
  /** Rows before any display cap, so the workbook can say what it left out. */
  totalRows: number;
};

export type ReportDefinition = {
  id: string;
  module: ReportModule;
  title: string;
  /** One sentence, written for whoever has to choose between thirty-seven. */
  description: string;
  columns: ReportColumn[];
  filters: ReportFilter[];
  /** Sensible default range when the picker opens: months back from today. */
  defaultMonthsBack?: number;
  run: (params: ReportParams) => Promise<ReportResult>;
};

/**
 * The ceiling on one export.
 *
 * 50,000 rows is about 8 MB of xlsx and comfortably inside what Excel and a
 * serverless function will both carry. Above it the export still WORKS — it is
 * truncated and the workbook says so on its face, in the file name and on the
 * Notes sheet. Silently returning the first 50,000 rows of a 200,000-row
 * answer is how somebody reconciles a year and comes up short.
 */
export const MAX_EXPORT_ROWS = 50_000;
