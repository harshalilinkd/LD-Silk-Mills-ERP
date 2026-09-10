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

export const MODULE_META: Record<
  ReportModule,
  { label: string; systemCode: string | null }
> = {
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
  /** Rupees. Right aligned, `#,##0` — whole, no paise — and totalled at the foot. */
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
  /**
   * What the Total row at the foot of the Data sheet should do with it.
   *
   * ── THIS EXISTS BECAUSE THE FOOTER WAS PRINTING NONSENSE ────────────
   *
   * The first version summed every numeric column. That put "Share: 73.8%"
   * under a column that must total 100, "Fabrics: 734" under a count of
   * distinct fabrics, "Avg order: ₹3.85 crore" under a column of averages, and
   * "Order Entry — days late: 45,665" under a column of days. Every one of
   * those is arithmetic nobody asked for and none of them means anything —
   * and a report going to the MD cannot carry a single figure like that.
   *
   *   · `sum`  — genuinely additive. Money, metres, counts of things that
   *              belong to this row alone.
   *   · `avg`  — an average, so the footer recomputes it across the whole
   *              file rather than adding the rows up. Weighted by
   *              `avgWeightBy` where that is the honest way (rate is value
   *              over metres, not the mean of the rates).
   *   · `none` — leave the cell empty. Distinct counts (a quality counted
   *              once per order is not a quality counted once), percentages
   *              that are already shares, ages, and anything else where a
   *              total is a category error.
   *
   * Defaults by type when omitted: money / number / int / percent sum, and
   * everything else is blank. Every column that must not sum says so.
   */
  total?: "sum" | "avg" | "none";
  /** For `total: "avg"` — the column to weight by. Omit for a plain mean. */
  avgWeightBy?: string;
  /**
   * `MTR`, `PCS`, `KG`. Printed inside the cell by the workbook so a column of
   * figures says what it is measuring when it is read out of context — a
   * screenshot of three columns, a pasted range, a printed page.
   */
  unit?: "MTR" | "PCS" | "KG";
  /**
   * Turns a status column into compact coloured badges on the Data sheet:
   * value → what that value MEANS. Explicit per column and never inferred,
   * because the same word points opposite ways on two columns — "Cancelled:
   * Yes" is bad and "Received: Yes" is good, and no type can tell them apart.
   *
   * Only worth setting where a reader would otherwise have to interpret the
   * text. A plain name or a date does not need a colour.
   */
  badge?: Record<string, "good" | "warn" | "bad" | "neutral">;
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
  /**
   * What this row MEANS, where the categories are statuses rather than names.
   *
   * `Done` is green and `Past their day` is red on the same chart, because on
   * a fixed-category comparison the categories ARE the statuses and the house
   * palette already says what each colour means. It is never set on a ranking:
   * a customer is not "good" for being third, and colouring them that way is
   * decoration pretending to be information.
   */
  tone?: Tone;
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
  /**
   * `severity` means the ROWS ARE ORDERED BEST TO WORST and the palette may
   * say so — green, teal, amber, red down the list. Only ageing sets it. Every
   * other panel is drawn in one colour, because a ranking's third bar is not
   * "more amber" than its second and colouring it that way is decoration
   * pretending to be information.
   */
  tone?: "severity";
  /** What the numbers are: "Value", "Returns", "Entries". */
  valueLabel: string;
  rows: RankRow[];
  kind?: PanelKind;
  /**
   * The categories come from the QUESTION, not from the data — money in and
   * money out, done and still to do, settled and still open. Both sides exist
   * whether the answer is 40 and 12 or 1 and 0.
   *
   * It matters because the "one bar is not a chart" rule counts categories
   * that are NOT ZERO, which is right for a ranking (a customer who bought
   * nothing is not a bar) and wrong here: `Money in ₹0 · Money out ₹5,000` is
   * a real comparison, and `Still open: 0` is the single figure a coordinator
   * opens the file to see. A zero is an answer on these panels, so they draw
   * as long as SOMETHING in them is non-zero.
   *
   * Not a licence to keep empty panels — a panel whose every bar is zero is
   * still dropped, because that is an empty period rather than an answer.
   */
  fixedCategories?: boolean;
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
  rows: {
    label: string;
    values: (number | null)[];
    total: number;
    totalDisplay: string;
  }[];
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Files hanging off a row — the receipts, on their own sheet
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A file name in a cell is not the bill. The owner asked for the receipt
 * itself in the workbook, and the workbook now carries a **Receipts** sheet:
 * one row per attachment, the image beside the entry's reference, date, payee
 * and amount.
 *
 * ── WHY A SHEET AND NOT THE CELL ─────────────────────────────────────────
 *
 * An embedded image FLOATS over cells; it does not belong to the row. Excel
 * moves floating pictures when rows are inserted or filtered and does NOT
 * move them when a range is sorted — so one click on the Data sheet's sort
 * button would leave every receipt sitting over somebody else's entry, with
 * nothing on the page to say it had happened. A receipt over the wrong
 * payment is worse than no receipt. The annexure keeps each image on a row of
 * its own that carries the reference it belongs to, and the Data sheet stays
 * the sortable, filterable table it is meant to be.
 *
 * ── BYTES ARE FETCHED LATE, AND ONLY FOR XLSX ────────────────────────────
 *
 * `byRow` holds names and opaque references only — cheap, and computed in the
 * report's own query. `load` is called by the workbook builder alone, so a
 * CSV export never touches storage and a 5,000-row period never pulls 5,000
 * photographs to print a table.
 *
 * The reference is a STORAGE PATH and it is never written into the file. A
 * path in a workbook is a path somebody tries, and the whole attachment
 * design refuses to hand out anything that works without a permission check.
 */
export type ReportImageRef = {
  /** What a person sees. The uploader's own filename. */
  name: string;
  /** Opaque to everything but `load`. NEVER printed. */
  ref: string;
  /** From storage. Anything that is not `image/*` is listed, not drawn. */
  mime: string | null;
};

export type ReportImages = {
  /** The column whose value identifies a row — `uid` on the cash book. */
  rowKey: string;
  /** Column keys to print beside each image, in order. */
  columns: string[];
  /** Row identity → the files hanging off it. */
  byRow: Record<string, ReportImageRef[]>;
  /**
   * Bytes for one reference, or null when it cannot be read — a file deleted
   * from the bucket must leave a line saying so, not fail the export.
   */
  load: (ref: string) => Promise<Buffer | null>;
};

export type ReportResult = {
  rows: ReportRow[];
  analysis: ReportAnalysis;
  /** Rows before any display cap, so the workbook can say what it left out. */
  totalRows: number;
  /**
   * Set when the report ran but there is nothing to hand over and the reason
   * needs saying — "your account has no Help Slip profile". The export route
   * answers with this sentence rather than a file, because a CSV is one header
   * row and no room to explain itself.
   */
  notice?: string;
  /** Attachments to draw on the Receipts sheet. XLSX only; the CSV ignores it. */
  images?: ReportImages;
};

export type ReportDefinition = {
  id: string;
  module: ReportModule;
  title: string;
  /** One sentence, written for whoever has to choose between thirty-seven. */
  description: string;
  columns: ReportColumn[];
  filters: ReportFilter[];
  /**
   * NOT WIRED TO ANYTHING, AND THAT IS DELIBERATE.
   *
   * It used to pre-fill the picker's date boxes — three months on the order
   * register, two on line detail. Nothing was wrong with the file that came
   * out; it carried exactly the window it was handed. But the window had been
   * chosen by a default nobody set, so somebody exported "their orders",
   * searched the sheet for order 420 and found nothing, because 420 was raised
   * in May and the box silently said June. Ten orders and 535 lines were
   * missing with nothing on screen to suggest it.
   *
   * The dates now start BLANK, which the route reads as the whole period. This
   * field is kept only as a record of what each report once considered a
   * sensible window; if it is ever used again it must be as a visible
   * SUGGESTION the person can see and accept, never a silent pre-fill.
   */
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
