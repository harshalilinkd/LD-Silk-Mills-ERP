// What the old sheet's columns can become, and the guess at which is which.

import type { ColumnMap, ImportField } from "./types";
import { normaliseName } from "./coerce";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The target columns
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Exactly the columns the order form writes, and no others. `line_total` is
 * deliberately absent as a TARGET: it is a generated column
 * (`qty_mtr * rate`), so writing to it is an error Postgres raises. It appears
 * below as `check_total` instead — mapped, read, and used only to CHECK the
 * arithmetic, which is worth far more on a sheet where somebody may have
 * overtyped a total by hand.
 *
 * `max` is the database column's own width. A party name of 240 characters is
 * refused here with a readable reason rather than by a `value too long for
 * type character varying(200)` from the driver at the end of a long import.
 */
export const IMPORT_FIELDS: ImportField[] = [
  // ── the order ───────────────────────────────────────────────────────────
  {
    id: "order_no",
    label: "Order no",
    level: "order",
    kind: "text",
    required: true,
    max: 50,
    aliases: ["order no", "order number", "orderno", "order", "ord no", "o no", "bill no"],
    hint: "Rows sharing this become one order.",
  },
  {
    id: "order_date",
    label: "Order date",
    level: "order",
    kind: "date",
    required: true,
    aliases: ["order date", "date", "orderdate", "dt", "booking date", "entry date"],
  },
  {
    id: "party_name",
    label: "Party",
    level: "order",
    kind: "text",
    required: true,
    max: 200,
    aliases: ["party", "party name", "customer", "customer name", "buyer", "client", "firm"],
  },
  {
    id: "sales_person",
    label: "Sales person",
    level: "order",
    kind: "text",
    required: false,
    max: 100,
    aliases: ["sales person", "salesperson", "sales", "sales man", "salesman", "marketing"],
  },
  {
    id: "agent",
    label: "Agent",
    level: "order",
    kind: "text",
    required: false,
    max: 120,
    aliases: ["agent", "agent name", "broker", "agency"],
  },
  {
    id: "haste",
    label: "Haste",
    level: "order",
    kind: "text",
    required: false,
    max: 120,
    aliases: ["haste", "hasti", "urgency"],
  },
  {
    id: "transport",
    label: "Transport",
    level: "order",
    kind: "text",
    required: false,
    max: 120,
    aliases: ["transport", "transporter", "transport name", "courier"],
  },
  {
    id: "challan_no",
    label: "Challan no",
    level: "order",
    kind: "text",
    required: false,
    max: 100,
    aliases: ["challan", "challan no", "challan number", "chalan", "chalan no", "dc no"],
  },
  {
    id: "lot_no",
    label: "Lot no",
    level: "order",
    kind: "text",
    required: false,
    max: 100,
    aliases: ["lot", "lot no", "lot number", "batch", "batch no"],
  },
  {
    id: "department",
    label: "Department",
    level: "order",
    kind: "text",
    required: false,
    max: 40,
    aliases: ["dept", "department", "div", "division", "unit", "company"],
    hint: "The sheet's `DEPT.` column — `LD` or `LINKD`. Left unmapped, every order is stored as `LD`, which is the database default and would quietly merge the two departments.",
  },
  {
    id: "order_remarks",
    label: "Order remarks",
    level: "order",
    kind: "text",
    required: false,
    aliases: ["remarks", "remark", "note", "notes", "comment", "comments"],
  },

  // ── the design line ─────────────────────────────────────────────────────
  {
    id: "quality",
    label: "Fabric",
    level: "line",
    kind: "text",
    required: true,
    max: 100,
    aliases: ["fabric", "quality", "cloth", "fabric name", "quality name", "item", "material"],
    hint: "The column is `quality` in the database; every screen calls it Fabric.",
  },
  {
    id: "design_no",
    label: "Design no",
    level: "line",
    kind: "text",
    required: true,
    max: 100,
    aliases: ["design", "design no", "design number", "designno", "des no", "art no", "article", "dsgn", "dsgn no", "dsgn matching", "design matching", "matching"],
  },
  {
    id: "qty_mtr",
    label: "Qty (mtr)",
    level: "line",
    kind: "number",
    required: true,
    aliases: ["qty", "quantity", "mtr", "meters", "metres", "qty mtr", "qty in mtr", "meter", "mtr yard", "mtr yrd", "yard", "mtrs"],
  },
  {
    id: "rate",
    label: "Rate",
    level: "line",
    kind: "number",
    required: false,
    aliases: ["rate", "price", "rate per mtr", "unit rate", "per mtr"],
  },
  {
    id: "is_cancelled",
    label: "Cancelled",
    level: "line",
    kind: "flag",
    required: false,
    // ── "status" IS NOT AN ALIAS HERE, DELIBERATELY ──────────────────────
    //
    // The old workbook has BOTH a `Cancelled order` column and a `Status`
    // column, and the production-status sheet that imports next is nothing but
    // status columns. Claiming `Status` for the cancellation flag would let a
    // stage word land in `is_cancelled` — so the generic word is left for a
    // person to map by hand, and only the explicit spellings auto-map.
    aliases: ["cancelled", "canceled", "cancel", "is cancelled", "cancelled order", "cancel order", "order cancelled"],
    hint: 'Blank or no means the line is live. This sheet writes "OK" for live and "Cancelled" for dead.',
  },
  {
    id: "line_remarks",
    label: "Line remarks",
    level: "line",
    kind: "text",
    required: false,
    aliases: ["line remarks", "design remarks", "item remarks", "reason", "reson", "reason for delay", "reason for dealy"],
  },

  // ── read, never written ─────────────────────────────────────────────────
  {
    id: "check_total",
    label: "Amount (checked, not imported)",
    level: "line",
    kind: "number",
    required: false,
    aliases: ["amount", "total", "line total", "value", "net amount", "total amount"],
    hint:
      "The line total is computed by the database as qty x rate. Map this and every row is checked against it — mismatches are reported, nothing is overwritten.",
  },
];

export const FIELD_BY_ID = new Map(IMPORT_FIELDS.map((f) => [f.id, f]));

/** The name a header is MATCHED by. Never the name it is shown as. */
function headerKey(h: string): string {
  return normaliseName(h)
    // `qty.` and `qty` are one header; so are `party name*` and `party name`.
    .replace(/\b(no|number|nos)\b/g, "no")
    .trim();
}

/**
 * The opening guess at which column is which.
 *
 * ── A GUESS, SHOWN, NEVER APPLIED SILENTLY ────────────────────────────────
 *
 * Every mapping this returns is rendered as a dropdown the person can change
 * before anything is read. That is the difference between a convenience and a
 * trap: an importer that quietly decides `Total` is the rate has invented
 * prices for half a year, and every downstream figure looks plausible.
 *
 * Exact matches are taken first across ALL fields before any loose match is
 * considered, so a sheet carrying both `Rate` and `Total Rate` cannot have the
 * wrong one win on ordering. A source column is used at most once.
 */
export function suggestMapping(headers: string[]): ColumnMap {
  const map: ColumnMap = Object.fromEntries(
    IMPORT_FIELDS.map((f) => [f.id, null]),
  );
  const keys = headers.map(headerKey);
  const taken = new Set<number>();

  const claim = (fieldId: string, i: number) => {
    map[fieldId] = i;
    taken.add(i);
  };

  // Pass 1 — a header that IS one of the aliases.
  for (const f of IMPORT_FIELDS) {
    if (map[f.id] !== null) continue;
    const want = new Set([headerKey(f.label), ...f.aliases.map(headerKey)]);
    const i = keys.findIndex((k, idx) => !taken.has(idx) && k && want.has(k));
    if (i >= 0) claim(f.id, i);
  }

  // Pass 2 — a header that CONTAINS an alias as whole words. Short aliases are
  // excluded here: "date" inside "candidate" is the kind of match that makes
  // an auto-mapper untrustworthy.
  for (const f of IMPORT_FIELDS) {
    if (map[f.id] !== null) continue;
    const want = [headerKey(f.label), ...f.aliases.map(headerKey)].filter(
      (a) => a.length >= 4,
    );
    const i = keys.findIndex(
      (k, idx) =>
        !taken.has(idx) &&
        k &&
        want.some((a) => new RegExp(`(^| )${a}( |$)`).test(k)),
    );
    if (i >= 0) claim(f.id, i);
  }

  return map;
}

/** Fields that must be mapped before an import can be previewed at all. */
export function missingRequired(map: ColumnMap): ImportField[] {
  return IMPORT_FIELDS.filter((f) => f.required && map[f.id] == null);
}
