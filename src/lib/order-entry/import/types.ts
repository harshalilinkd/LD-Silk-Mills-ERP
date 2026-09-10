// Bringing the old Google Sheet in — the shared vocabulary.
//
// ═══════════════════════════════════════════════════════════════════════════
//  WHY THIS IS NOT THE CHECKLIST'S IMPORTER
// ═══════════════════════════════════════════════════════════════════════════
//
// `lib/checklist/import.ts` already does bulk import well, and its shape is
// copied here deliberately: parse in ONE module that both the browser preview
// and the server action call, so the preview cannot promise something the
// write does not do. A preview saying "142 orders will be added" over a server
// that adds 137 is worse than no preview, because the first number is the one
// somebody remembers.
//
// What is NOT shared is the COERCION. The checklist reads a date as ISO or
// day-first and refuses everything else, which is right for a sheet somebody
// typed last week to a known format. This importer reads half a financial year
// of a spreadsheet that was never validated by anything: Excel serial numbers,
// `12-Jun-26`, `₹ 1,234.50`, `1200 mtr`, a design number Sheets turned into
// the number 1 because it was typed `01`. Making the checklist's parser that
// lenient would silently widen what a checklist import accepts, which nobody
// asked for. Two parsers, on purpose, each as lenient as its own source
// deserves.
//
// ── EVERY CHANGE IS REPORTED ──────────────────────────────────────────────
//
// The rule this module is built around: it may CLEAN a value, but it may never
// clean one quietly. `₹1,23,456.00` becoming `123456` is obviously fine and
// still gets a note, because the person approving the import is the only one
// who can tell a harmless tidy from the one row where "12/06" meant December.

/** What kind of value a target column holds, and therefore how it is read. */
export type FieldKind = "text" | "date" | "number" | "flag";

/** Which table the value lands in. */
export type FieldLevel = "order" | "line";

export type ImportField = {
  id: string;
  label: string;
  level: FieldLevel;
  kind: FieldKind;
  required: boolean;
  /** Longest the database column will take; longer values are an error. */
  max?: number;
  /**
   * Header spellings seen in the wild, normalised. Used ONLY to pre-select a
   * mapping the person can then change — never to decide one silently.
   */
  aliases: string[];
  hint?: string;
};

/** One value read out of one cell. */
export type Coerced<T> =
  | { ok: true; value: T | null; note?: string }
  | { ok: false; reason: string };

/**
 * `skip` is not `error`, and the difference is the whole report.
 *
 * An order already in the new system is not a mistake somebody has to go and
 * fix — it is a row the import steps over. Bundling the two would make a
 * second run of the same sheet look like three hundred failures.
 */
export type RowVerdict = "add" | "skip" | "error";

/** Something the import wants to say about a row, at three volumes. */
export type Issue = {
  level: "error" | "warn" | "note";
  /** 1-based line in the source file, as the person sees it in Sheets. */
  line: number;
  field?: string;
  message: string;
};

/** One design line, read and cleaned. */
export type PlannedLine = {
  line: number;
  quality: string;
  designNo: string;
  qtyMtr: number;
  rate: number | null;
  isCancelled: boolean;
  remarks: string | null;
};

/** One order, assembled from every row that shares its order number. */
export type PlannedOrder = {
  verdict: RowVerdict;
  /** Every source line this order was built from, for the report. */
  lines: number[];
  orderNo: string;
  orderDate: string | null;
  partyName: string;
  salesPerson: string | null;
  agent: string | null;
  haste: string | null;
  transport: string | null;
  challanNo: string | null;
  lotNo: string | null;
  /** `LD` or `LINKD`. Null leaves the database default (`LD`) in place. */
  department: string | null;
  remarks: string | null;
  items: PlannedLine[];
  issues: Issue[];
};

/**
 * A name in the sheet that our master lists have never heard of.
 *
 * The order still imports — `customer_orders.party_name` is TEXT, not a
 * foreign key, so nothing refuses it. But the name would then be missing from
 * every dropdown and every filter, so an imported order could not be found by
 * picking its own party. These are offered as a tick-box at the end instead of
 * being created silently, because "PR EXPO" and "PR EXPO " and "Pr Expo" are
 * three new parties and somebody has to look at that list once.
 */
export type UnknownName = {
  category: "PARTY" | "FABRIC" | "AGENT" | "SALES_PERSON" | "TRANSPORT" | "HASTE";
  value: string;
  /** How many source rows used it — a name used once is usually a typo. */
  uses: number;
  /** The closest existing master value, when there is an obvious one. */
  nearest?: string;
};

export type ImportPlan = {
  orders: PlannedOrder[];
  /** Issues that belong to the file rather than to one order. */
  fileIssues: Issue[];
  unknown: UnknownName[];
  counts: {
    sourceRows: number;
    orders: number;
    add: number;
    skip: number;
    error: number;
    lines: number;
    errors: number;
    warnings: number;
  };
};

/** Which source column feeds which field. `null` = not mapped. */
export type ColumnMap = Record<string, number | null>;

/** A parsed sheet, before any mapping is applied. */
export type SheetData = {
  name: string;
  headers: string[];
  rows: string[][];
  /**
   * Every row exactly as the file has it, heading row included.
   *
   * `headers`/`rows` above are the orders importer's view: the first non-empty
   * row is taken as the heading and everything under it is data. The
   * production-status sheet breaks that — it opens with a timestamp row and
   * three rows of department names, and its real heading is the sixth row —
   * so `status-layout.ts` finds its own heading here instead. Keeping both
   * views means neither importer has to distort the file for the other.
   */
  raw: string[][];
};
