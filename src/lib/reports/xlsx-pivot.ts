import JSZip from "jszip";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A real Excel PivotTable, with real Slicers, in the exported workbook
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * The owner asked for the export to carry the same "see every fabric, filter
 * it yourself" ability a PivotTable gives — not the fixed top-40 heat grid on
 * the Dashboard, which is capped so the page stays printable. ExcelJS has no
 * PivotTable API (same story as the charts in `xlsx-charts.ts`: a chart, a
 * pivot table and a slicer are each just XML parts inside the zip), so this
 * file writes those parts by hand into the already-finished workbook.
 *
 * ── HOW THE XML WAS GOT RIGHT: NOT FROM MEMORY, FROM EXCEL ITSELF ─────────
 *
 * A pivot cache field has a `sharedItems` attribute, `containsSemiMixedTypes`,
 * that is only legal on a field also declared `containsNumber="1"` — set it on
 * a plain text field (even with every other attribute "correct") and Excel
 * refuses the whole workbook, silently, with a COM error that names no part
 * ("Unable to get the Open property of the Workbooks class" — Excel's generic
 * "something is wrong" code, 0x800A03EC). No XML validator catches this: the
 * part is well-formed, and even opening it back up with a different library
 * (openpyxl) "succeeds" — proving only that the XML parses, not that Excel
 * accepts it, which is the exact lesson already written into the chart file.
 *
 * So none of this was written from the ECMA-376 spec alone. A real Excel
 * (COM-automated on the machine this was built on) was asked to build a
 * PivotTable and a Slicer itself — `SlicerCaches.Add2` / `Slicer.Add`, and
 * later `CreatePivotTable` with `Orientation` set to put a field on rows,
 * columns, or as a second/third data field — on throwaway files, and the
 * resulting parts were read back as ground truth: the exact namespaces
 * (`.../drawing/2010/slicer`, not the `x14` guess that seemed natural), the
 * exact extension mechanism a slicer's `pivotCacheId` actually resolves
 * through (an `x14:pivotCacheDefinition` extension INSIDE
 * `pivotCacheDefinition1.xml` — not the workbook-level `cacheId`, which is a
 * different, unrelated number), the required `mc:Fallback` shape a slicer's
 * drawing anchor carries for older Excel versions, and — the hardest of the
 * four — the exact `colItems`/`colFields` shape when a column field and two
 * or more data fields combine (a synthetic "Σ Values" field at index `-2`
 * that only appears once there are 2+ data fields, with a distinct `colItems`
 * layout depending on whether a real column field is present at all). Every
 * shape below was then verified against that same real Excel: opened via
 * COM, refreshed, and — for the slicer — actually toggled (deselecting a
 * slicer item and confirming the PivotTable's total changed by exactly the
 * excluded row's value) before this was trusted enough to ship.
 *
 * ── TWO SHARED ITEMS THAT COLLIDE ONCE CASE-FOLDED ALSO CORRUPT THE FILE ──
 *
 * Line Detail's real data has both "NEXA" and "Nexa" as a fabric name — one
 * sloppy re-entry of the other. Keeping them as two separate shared items
 * reproducibly corrupted the file once enough records existed for Excel's own
 * case-insensitive handling of a field's items to collide with two entries
 * that are "the same" under it — the exact same generic, part-naming-nothing
 * error as above. Every discrete field is therefore built from a
 * case/whitespace-folded key (`itemKey`), never the raw value.
 *
 * ── THE SOURCE IS A CELL RANGE, NOT AN EXCEL TABLE ─────────────────────────
 *
 * A pivot cache can source from either a named Table or a plain
 * `sheet="Data" ref="A1:P6459"` reference. The Data sheet here is plain cells
 * with an AutoFilter, not a Table object, and converting it into one would be
 * a wider, riskier change than this feature needs — so the cell-range form is
 * used, and it was verified against real Excel exactly like everything else.
 *
 * ── THIS FUNCTION IS CALLED MORE THAN ONCE PER WORKBOOK ──────────────────
 *
 * A report can want more than one pivot table (Line Detail: a fabric×party
 * breakdown AND a party/agent/sales-person rollup). Every numbered part —
 * `pivotCacheDefinitionN.xml`, `pivotTableN.xml`, `slicerCacheN.xml`,
 * `slicerN.xml`, `drawingN.xml`, `sheetN.xml` — is therefore picked as
 * "one past whatever is already in this zip", the same pattern
 * `xlsx-charts.ts` already uses for its own drawing numbers, and the
 * workbook-level `<pivotCaches>`/`<definedNames>`/slicer `extLst` are
 * APPENDED into if they already exist rather than re-created — a second
 * call re-declaring them would leave two `<pivotCaches>` elements, which
 * `CT_Workbook` does not allow.
 */

// ─── namespaces ─────────────────────────────────────────────────────────────

const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_X14 = "http://schemas.microsoft.com/office/spreadsheetml/2009/9/main";
const NS_XDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const NS_A14 = "http://schemas.microsoft.com/office/drawing/2010/main";
const NS_SLE = "http://schemas.microsoft.com/office/drawing/2010/slicer";

const REL_PIVOT_CACHE_DEF = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheDefinition";
const REL_PIVOT_CACHE_REC = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheRecords";
const REL_PIVOT_TABLE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotTable";
const REL_WORKSHEET = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
const REL_DRAWING = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing";
const REL_SLICER_CACHE = "http://schemas.microsoft.com/office/2007/relationships/slicerCache";
const REL_SLICER = "http://schemas.microsoft.com/office/2007/relationships/slicer";

const CT_PIVOT_CACHE_DEF = "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml";
const CT_PIVOT_CACHE_REC = "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheRecords+xml";
const CT_PIVOT_TABLE = "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml";
const CT_WORKSHEET = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
const CT_DRAWING = "application/vnd.openxmlformats-officedocument.drawing+xml";
const CT_SLICER_CACHE = "application/vnd.ms-excel.slicerCache+xml";
const CT_SLICER = "application/vnd.ms-excel.slicer+xml";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Excel rejects control characters outright; see xlsx-charts.ts's `esc`.
    .replace(CONTROL_CHARS, "");
}

const CONTROL_CHARS = new RegExp(
  "[" + String.fromCharCode(0) + "-" + String.fromCharCode(8) +
    String.fromCharCode(11) + String.fromCharCode(12) +
    String.fromCharCode(14) + "-" + String.fromCharCode(31) + "]",
  "g",
);

// ─── what a caller describes ────────────────────────────────────────────────

export type PivotFieldKind = "text" | "number";

export type PivotFieldSpec = {
  /** Must equal the column's header text on the source range. */
  name: string;
  kind: PivotFieldKind;
};

export type PivotDataField = {
  /**
   * Which field to aggregate. Must be a NUMERIC field for `sum` (the
   * default); `count` accepts a text field too and counts non-empty values,
   * which is how you get "how many rows" out of a report that has nothing
   * genuinely additive on it (Checklist's duty register has no sum-able
   * column at all — every number on it is an average or a distinct count).
   */
  field: string;
  /**
   * Defaults to "sum".
   *
   * `average` is Excel's PLAIN mean of the rows in the group — it is NOT
   * weighted. For a rate that matters: the house rule (see
   * `ReportColumn.avgWeightBy`) is that a rate's average is weighted by
   * quantity, because an unweighted mean counts a 6-metre line the same as
   * a 6,000-metre one. A pivot cannot express that (Excel needs a
   * calculated field for it, and this Excel refuses to create one), so an
   * `average` data field must be LABELLED as the unweighted figure it is.
   */
  aggregate?: "sum" | "count" | "average";
  /** Defaults to `Sum of ${field}` / `Count of ${field}` / `Average of ${field}`. */
  label?: string;
};

export type PivotSpec = {
  /** The sheet the data range lives on, e.g. "Data". */
  sourceSheet: string;
  /** The full header+rows range on that sheet, e.g. "A1:P6459". */
  sourceRef: string;
  /** One entry per column of `sourceRef`, in the same left-to-right order. */
  fields: PivotFieldSpec[];
  /** Column values in field order, one array per data row (no header row). */
  rows: (string | number | null)[][];
  /**
   * The row axis, outermost first. All must be "text" fields.
   *
   * More than one nests them and switches the table to Excel's TABULAR
   * layout with a subtotal after each outer group and the outer label
   * repeated down its rows — the shape a person gets from "Repeat All Item
   * Labels", and the one that reads like a register rather than a
   * spreadsheet puzzle.
   */
  rowFields: string[];
  /** Which field is the column axis, if any. Must be a "text" field. */
  colField?: string;
  /** One or more NUMERIC fields to sum, side by side. */
  dataFields: PivotDataField[];
  /** Which fields get a slicer, left to right along the top of the sheet. */
  slicerFields: string[];
  /** Name of the new sheet the pivot table and slicers are drawn on. */
  pivotSheetName: string;
  /** The pivot table's own internal name — must be unique within the workbook. */
  pivotTableName?: string;
};

// ─── cache field building ───────────────────────────────────────────────────

type FieldPlan = {
  spec: PivotFieldSpec;
  index: number;
  /** Distinct values, in first-seen order — only built for the row field,
   * the column field, and the slicer fields; the only ones that need a
   * discrete item list. */
  distinct: (string | number)[];
  distinctIndex: Map<string | number, number>;
  /** Only set for a "number" field with no discrete list — the range Excel's
   * own generated files always carry on a measure (see `cacheFieldXml`). */
  numberRange: { min: number; max: number } | null;
};

/**
 * The key two values are COMPARED under when deciding "is this the same
 * item". Never the value stored or displayed. See the file header for why
 * this exists — "NEXA" vs "Nexa" corrupted a real export.
 */
function itemKey(v: string | number): string | number {
  return typeof v === "string" ? v.trim().toLowerCase() : v;
}

function buildFieldPlans(spec: PivotSpec): FieldPlan[] {
  const needsDiscrete = new Set(
    [...spec.rowFields, spec.colField, ...spec.slicerFields].filter((x): x is string => !!x),
  );
  return spec.fields.map((f, index) => {
    const distinct: (string | number)[] = [];
    // Keyed by `itemKey`, not the raw value — see `itemKey` above.
    const distinctIndex = new Map<string | number, number>();
    // ── ONLY THE ROW/COLUMN FIELD AND THE SLICER FIELDS GET A DISCRETE LIST ─
    //
    // A discrete `sharedItems` list is what lets a field become an axis or a
    // slicer, but every OTHER text column pays for one regardless of ever
    // being used, and "regardless" turned out to include free-text columns —
    // Remarks, on Line Detail, is close to one distinct value per row across
    // 6,459 lines. Building a several-thousand-entry shared list for a field
    // the pivot never touches is not just wasteful: it is the one place real
    // production data (long strings, odd punctuation) is most likely to trip
    // something a small proof-of-concept never exercised. A field left out of
    // this set is written as a RAW value on every record instead (see
    // `recordXml`) — exactly how `OrderDate` and a measure were proven to work.
    const wantsDiscrete = needsDiscrete.has(f.name);
    if (wantsDiscrete) {
      for (const row of spec.rows) {
        const v = row[index];
        if (v === null || v === undefined) continue;
        const key = itemKey(v);
        if (!distinctIndex.has(key)) {
          // First casing seen wins the display form — arbitrary but stable,
          // and no worse than which one happened to be typed first.
          distinctIndex.set(key, distinct.length);
          distinct.push(v);
        }
      }
    }
    // A "number" field that is not discretized still needs its min/max
    // recorded — the exact shape Excel itself writes for a measure, and the
    // one place `containsSemiMixedTypes="0"` is legal (pairing it with
    // `containsString="1"` on a TEXT field is exactly what Excel silently
    // refuses; see the file header). Omitting this range entirely was tried
    // and is NOT equivalent — it is what the very first production build of
    // this module shipped with, and on Line Detail's real ~6,459 rows it
    // reproducibly corrupted the file once the value field's data crossed a
    // certain shape, in a way six rows of toy data never exercised.
    let numberRange: { min: number; max: number } | null = null;
    if (f.kind === "number") {
      let min = Infinity;
      let max = -Infinity;
      for (const row of spec.rows) {
        const v = row[index];
        if (typeof v !== "number" || !Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (Number.isFinite(min) && Number.isFinite(max)) numberRange = { min, max };
    }
    return { spec: f, index, distinct, distinctIndex, numberRange };
  });
}

function cacheFieldXml(plan: FieldPlan): string {
  const { spec, distinct, numberRange } = plan;
  if (spec.kind === "number" && distinct.length === 0) {
    if (!numberRange) return `<cacheField name="${esc(spec.name)}" numFmtId="0"><sharedItems/></cacheField>`;
    const allInt = Number.isInteger(numberRange.min) && Number.isInteger(numberRange.max);
    return (
      `<cacheField name="${esc(spec.name)}" numFmtId="0"><sharedItems containsSemiMixedTypes="0" containsString="0" ` +
      `containsNumber="1"${allInt ? ` containsInteger="1"` : ""} minValue="${numberRange.min}" maxValue="${numberRange.max}"/></cacheField>`
    );
  }
  if (distinct.length === 0) {
    return `<cacheField name="${esc(spec.name)}" numFmtId="0"><sharedItems/></cacheField>`;
  }
  const items = distinct.map((v) => `<s v="${esc(String(v))}"/>`).join("");
  return `<cacheField name="${esc(spec.name)}" numFmtId="0"><sharedItems count="${distinct.length}">${items}</sharedItems></cacheField>`;
}

function recordXml(plans: FieldPlan[], row: (string | number | null)[]): string {
  const cells = plans
    .map((p) => {
      const v = row[p.index];
      if (v === null || v === undefined) return `<m/>`;
      if (p.distinct.length > 0) {
        const idx = p.distinctIndex.get(itemKey(v));
        return idx === undefined ? `<m/>` : `<x v="${idx}"/>`;
      }
      return typeof v === "number" ? `<n v="${v}"/>` : `<s v="${esc(String(v))}"/>`;
    })
    .join("");
  return `<r>${cells}</r>`;
}

/** The `<items>` list an axis field (row or single-data-field column) carries. */
function axisItemsXml(plan: FieldPlan): string {
  const items = plan.distinct.map((_, i) => `<item x="${i}"/>`).join("") + `<item t="default"/>`;
  return `<items count="${plan.distinct.length + 1}">${items}</items>`;
}

/**
 * In TABULAR layout every field carries `compact="0" outline="0"` and a
 * `fillDownLabels` extension — that extension is what repeats the outer
 * label down its own rows instead of leaving blanks under it. Excel writes
 * it on EVERY field, including the ones not on an axis, so this does too.
 */
const FILL_DOWN_EXT =
  `<extLst><ext uri="{2946ED86-A175-432a-8AC1-64E0C546D7DE}" xmlns:x14="${NS_X14}">` +
  `<x14:pivotField fillDownLabels="1"/></ext></extLst>`;

function pivotFieldXml(
  plan: FieldPlan,
  isRow: boolean,
  isCol: boolean,
  isData: boolean,
  tabular: boolean,
): string {
  const attrs = tabular ? ` compact="0" outline="0"` : "";
  const ext = tabular ? FILL_DOWN_EXT : "";
  if (isData) {
    return tabular
      ? `<pivotField dataField="1"${attrs} showAll="0">${ext}</pivotField>`
      : `<pivotField dataField="1" showAll="0"/>`;
  }
  if (plan.distinct.length === 0) {
    return tabular
      ? `<pivotField${attrs} showAll="0">${ext}</pivotField>`
      : `<pivotField showAll="0"/>`;
  }
  const axis = isRow ? ` axis="axisRow"` : isCol ? ` axis="axisCol"` : "";
  return `<pivotField${axis}${attrs} showAll="0">${axisItemsXml(plan)}${ext}</pivotField>`;
}

/**
 * `<i>` entries for a NESTED row axis — the intricate one.
 *
 * Ground truth, from Excel building this itself (two row fields, tabular):
 *
 *   <i><x/><x v="1"/></i>          first row of a group: both levels stated
 *   <i r="1"><x v="2"/></i>        later row: `r` = how many leading levels
 *                                   repeat from the row above, so only the
 *                                   inner one is restated
 *   <i t="default"><x v="1"/></i>  that group's subtotal
 *   <i t="grand"><x/></i>          and one grand total at the end
 *
 * `<x/>` is the shorthand Excel uses for `<x v="0"/>`.
 *
 * Only combinations that actually OCCUR are listed — a party gets rows for
 * the fabrics it bought, not for all 240. Emitted in cache-index order;
 * Excel re-sorts on the load refresh, the same as the single-field case.
 */
function nestedRowItems(
  outer: FieldPlan,
  inner: FieldPlan,
  rows: (string | number | null)[][],
): { xml: string; count: number } {
  // Which inner values occur under each outer value.
  const byOuter = new Map<number, Set<number>>();
  for (const row of rows) {
    const ov = row[outer.index];
    const iv = row[inner.index];
    if (ov === null || ov === undefined || iv === null || iv === undefined) continue;
    const oi = outer.distinctIndex.get(itemKey(ov));
    const ii = inner.distinctIndex.get(itemKey(iv));
    if (oi === undefined || ii === undefined) continue;
    let s = byOuter.get(oi);
    if (!s) { s = new Set(); byOuter.set(oi, s); }
    s.add(ii);
  }

  const x = (v: number) => (v === 0 ? `<x/>` : `<x v="${v}"/>`);
  let xml = "";
  let count = 0;
  for (const oi of [...byOuter.keys()].sort((a, b) => a - b)) {
    const inners = [...byOuter.get(oi)!].sort((a, b) => a - b);
    inners.forEach((ii, k) => {
      xml += k === 0 ? `<i>${x(oi)}${x(ii)}</i>` : `<i r="1">${x(ii)}</i>`;
      count++;
    });
    xml += `<i t="default">${x(oi)}</i>`;
    count++;
  }
  xml += `<i t="grand"><x/></i>`;
  count++;
  return { xml, count };
}

/**
 * `<i>` entries for a single-field axis (rows always; columns when there is
 * no column field's opposite number, i.e. the plain single-data-field case).
 * One entry per distinct value, in item order, then a grand total.
 */
function singleFieldAxisItems(plan: FieldPlan): string {
  return plan.distinct.map((_, i) => `<i><x v="${i}"/></i>`).join("") + `<i t="grand"><x/></i>`;
}

// ─── the pivot cache + pivot table parts ───────────────────────────────────

function buildPivotParts(
  spec: PivotSpec,
  pivotCacheIdExt: number,
  cacheId: number,
  sheetTabId: number,
  pivotTableName: string,
) {
  const plans = buildFieldPlans(spec);

  const findPlan = (name: string, what: string): FieldPlan => {
    const p = plans.find((x) => x.spec.name === name);
    if (!p) throw new Error(`pivot: ${what} "${name}" is not in fields`);
    return p;
  };
  if (!spec.rowFields.length) throw new Error("pivot: rowFields must have at least one entry");
  // Two is what the nested `rowItems` shape below was taken from and tested
  // against; three would need its own `r=`/`t="default"` layering, unproven.
  if (spec.rowFields.length > 2) throw new Error("pivot: at most two rowFields are supported");
  const rowPlans = spec.rowFields.map((f) => findPlan(f, "rowField"));
  // Discrete (row/column/slicer) fields are only proven for "text" — a
  // "number" one would need <n> shared items and containsNumber metadata
  // this module has never exercised, so it is refused rather than shipping
  // an untested shape.
  for (const p of rowPlans) {
    if (p.spec.kind !== "text") throw new Error(`pivot: rowField "${p.spec.name}" must be a text field`);
  }
  const rowPlan = rowPlans[0];
  // Every row's row-field value was null or blank. Nothing to lay down the
  // side, so there is no table to build — see the note in
  // `injectPivotTable`. Signalled rather than thrown: it is a data
  // condition, not a mistake in how the report declared its pivot.
  if (rowPlan.distinct.length === 0) return null;
  // Two separate things, and conflating them is why every one-field pivot
  // used to say "Row Labels":
  //
  //   nested  — more than one row field, so the ITEMS need the r=/t=default
  //             layering and the values start one column further right.
  //   tabular — the LAYOUT. Always on now.
  //
  // ── WHY TABULAR IS ALWAYS ON ─────────────────────────────────────────
  //
  // Excel's compact layout collapses every row field into one generic
  // "Row Labels" column with a single dropdown. Tabular gives each field
  // its own column headed by its own NAME with its own filter — verified
  // in Excel: compact renders `Row Labels | Sum of metres | Sum of value`,
  // tabular renders `Fabric | Party | Sum of metres | Sum of value`.
  // The owner asked for a filter on every header, and this is the part of
  // that which Excel can actually do: a DATA field (Sum of …) never gets
  // its own dropdown in any layout — measures are filtered through the
  // field dropdown's Value Filters instead.
  const nested = rowPlans.length > 1;
  const tabular = true;
  const colPlan = spec.colField ? findPlan(spec.colField, "colField") : null;
  if (colPlan && colPlan.spec.kind !== "text") throw new Error(`pivot: colField "${spec.colField}" must be a text field`);
  // Nesting rows AND a column field at once is a shape neither the ground
  // truth nor the tests cover; refused rather than guessed.
  if (nested && colPlan) throw new Error("pivot: a colField cannot be combined with nested rowFields");
  if (!spec.dataFields.length) throw new Error("pivot: dataFields must have at least one entry");
  const dataPlans = spec.dataFields.map((d) => ({ ...d, plan: findPlan(d.field, "dataField"), idx: -1 }));
  dataPlans.forEach((d) => { d.idx = plans.indexOf(d.plan); });
  for (const d of dataPlans) {
    // Averaging a text field is as meaningless as summing one.
    if ((d.aggregate ?? "sum") !== "count" && d.plan.spec.kind !== "number") {
      throw new Error(`pivot: dataField "${d.field}" is ${d.aggregate ?? "sum"}ed but is not a numeric field`);
    }
  }

  const cacheDef =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
    `<pivotCacheDefinition xmlns="${NS_MAIN}" xmlns:r="${NS_R}" r:id="rId1" ` +
    `refreshOnLoad="1" refreshedBy="LD Silk Mills ERP" createdVersion="6" refreshedVersion="6" minRefreshableVersion="3" recordCount="${spec.rows.length}">` +
    `<cacheSource type="worksheet"><worksheetSource ref="${esc(spec.sourceRef)}" sheet="${esc(spec.sourceSheet)}"/></cacheSource>` +
    `<cacheFields count="${plans.length}">${plans.map(cacheFieldXml).join("")}</cacheFields>` +
    `<extLst><ext uri="{725AE2AE-9491-48be-B2B4-4EB974FC3084}" xmlns:x14="${NS_X14}"><x14:pivotCacheDefinition pivotCacheId="${pivotCacheIdExt}"/></ext></extLst>` +
    `</pivotCacheDefinition>`;

  const recordsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
    `<pivotCacheRecords xmlns="${NS_MAIN}" xmlns:r="${NS_R}" count="${spec.rows.length}">` +
    spec.rows.map((row) => recordXml(plans, row)).join("") +
    `</pivotCacheRecords>`;

  // ── pivotFields ───────────────────────────────────────────────────────
  const pivotFieldsXml = plans
    .map((p) =>
      pivotFieldXml(
        p,
        rowPlans.includes(p),
        p === colPlan,
        dataPlans.some((d) => d.plan === p),
        tabular,
      ),
    )
    .join("");

  // ── rows: one field, or two nested in tabular form ───────────────────
  const rowAxis = nested
    ? nestedRowItems(rowPlans[0], rowPlans[1], spec.rows)
    : { xml: singleFieldAxisItems(rowPlan), count: rowPlan.distinct.length + 1 };
  const rowFieldsXml =
    `<rowFields count="${rowPlans.length}">` +
    rowPlans.map((p) => `<field x="${plans.indexOf(p)}"/>`).join("") +
    `</rowFields>`;

  // ── columns: four verified shapes, chosen by (colField present?) × (1 or N dataFields) ─
  //
  // Ground truth for all four, from a real Excel `CreatePivotTable` +
  // `Orientation`/`AddDataField` on a throwaway file (see file header):
  //   no col, 1 data:  <colItems count="1"><i/></colItems>                       (already proven, unchanged)
  //   no col, N data:  colFields=[-2]; one <i> per data field, no grand total
  //   col,   1 data:   colFields=[colField]; same shape as rowItems (+ grand)
  //   col,   N data:   colFields=[colField,-2]; cartesian, "r"/"i" attributes
  const N = dataPlans.length;
  let colFieldsXml: string;
  let colItemsXml: string;
  let colItemsCount: number;

  if (!colPlan && N === 1) {
    colFieldsXml = "";
    colItemsXml = `<i/>`;
    colItemsCount = 1;
  } else if (!colPlan && N > 1) {
    colFieldsXml = `<colFields count="1"><field x="-2"/></colFields>`;
    colItemsXml = Array.from({ length: N }, (_, d) =>
      d === 0 ? `<i><x/></i>` : `<i i="${d}"><x v="${d}"/></i>`,
    ).join("");
    colItemsCount = N;
  } else if (colPlan && N === 1) {
    colFieldsXml = `<colFields count="1"><field x="${plans.indexOf(colPlan)}"/></colFields>`;
    colItemsXml = singleFieldAxisItems(colPlan);
    colItemsCount = colPlan.distinct.length + 1;
  } else {
    // colPlan && N > 1
    colFieldsXml = `<colFields count="2"><field x="${plans.indexOf(colPlan!)}"/><field x="-2"/></colFields>`;
    const perValue = colPlan!.distinct
      .map((_, k) =>
        Array.from({ length: N }, (_, d) =>
          d === 0
            ? `<i>${k === 0 ? `<x/>` : `<x v="${k}"/>`}<x/></i>`
            : `<i r="1" i="${d}"><x v="${d}"/></i>`,
        ).join(""),
      )
      .join("");
    const grandTotals = Array.from({ length: N }, (_, d) =>
      d === 0 ? `<i t="grand"><x/></i>` : `<i t="grand" i="${d}"><x/></i>`,
    ).join("");
    colItemsXml = perValue + grandTotals;
    colItemsCount = colPlan!.distinct.length * N + N;
  }

  // ── location: the exact (firstHeaderRow, firstDataRow) pairs Excel itself
  //    writes for each shape above (ground truth; see header). Excel
  //    recomputes this on the load refresh, so it only has to be sane.
  const { firstHeaderRow, firstDataRow } = nested
    ? { firstHeaderRow: 1, firstDataRow: 1 }
    : !colPlan && N === 1
      ? { firstHeaderRow: 1, firstDataRow: 2 }
      : !colPlan && N > 1
        ? { firstHeaderRow: 0, firstDataRow: 1 }
        : colPlan && N === 1
          ? { firstHeaderRow: 1, firstDataRow: 2 }
          : { firstHeaderRow: 1, firstDataRow: 3 };
  const totalRows = firstDataRow + rowAxis.count;
  // Each nested row level occupies its own column before the values start.
  const totalCols = rowPlans.length + (colPlan ? colPlan.distinct.length * N + N : N);
  const colLetter = (n: number) => {
    let s = "";
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };
  const locationRef = `A1:${colLetter(totalCols)}${totalRows}`;

  // `subtotal` is the one attribute that separates count/average from a sum
  // — omitted entirely for a sum, which is the schema's own default.
  const SUBTOTAL: Record<string, string> = { count: "count", average: "average" };
  const VERB: Record<string, string> = { count: "Count", average: "Average" };
  const dataFieldsXml = dataPlans
    .map((d) => {
      const agg = d.aggregate ?? "sum";
      const fallback = `${VERB[agg] ?? "Sum"} of ${d.field}`;
      return (
        `<dataField name="${esc(d.label ?? fallback)}" fld="${d.idx}"` +
        (SUBTOTAL[agg] ? ` subtotal="${SUBTOTAL[agg]}"` : "") +
        ` baseField="0" baseItem="0"/>`
      );
    })
    .join("");

  // Tabular layout is `compact="0" compactData="0"` on the table and
  // `compact="0" outline="0"` on every field — NOT the `outline`/
  // `outlineData` pair a single-level table uses. Excel writes one or the
  // other, never a mix, and `fillDownLabelsDefault` is what makes the
  // repeated outer labels the default for new fields.
  const layoutAttrs = tabular ? `compact="0" compactData="0"` : `outline="1" outlineData="1"`;
  const tableExt =
    `<x14:pivotTableDefinition${tabular ? ` fillDownLabelsDefault="1"` : ""} hideValuesRow="1"/>`;

  const pivotTableXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
    `<pivotTableDefinition xmlns="${NS_MAIN}" name="${esc(pivotTableName)}" cacheId="${cacheId}" applyNumberFormats="0" applyBorderFormats="0" ` +
    `applyFontFormats="0" applyPatternFormats="0" applyAlignmentFormats="0" applyWidthHeightFormats="1" dataCaption="Values" ` +
    `updatedVersion="6" minRefreshableVersion="3" useAutoFormatting="1" itemPrintTitles="1" createdVersion="6" indent="0" ` +
    `${layoutAttrs} multipleFieldFilters="0">` +
    `<location ref="${locationRef}" firstHeaderRow="${firstHeaderRow}" firstDataRow="${firstDataRow}" firstDataCol="${rowPlans.length}"/>` +
    `<pivotFields count="${plans.length}">${pivotFieldsXml}</pivotFields>` +
    rowFieldsXml +
    `<rowItems count="${rowAxis.count}">${rowAxis.xml}</rowItems>` +
    colFieldsXml +
    `<colItems count="${colItemsCount}">${colItemsXml}</colItems>` +
    `<dataFields count="${N}">${dataFieldsXml}</dataFields>` +
    `<pivotTableStyleInfo name="PivotStyleMedium9" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>` +
    // Excel writes this on every pivot table it builds itself, and without it
    // a multi-data-field table renders a near-empty header row reading just
    // "Values" above the real column headings — visible, useless, and not
    // what the same table looks like when a person builds it by hand.
    `<extLst><ext uri="{962EF5D1-5CA2-4c93-8EF4-DBF5C05439D2}" xmlns:x14="${NS_X14}">` +
    tableExt +
    `</ext></extLst>` +
    `</pivotTableDefinition>`;

  return { plans, cacheDef, recordsXml, pivotTableXml };
}

// ─── one slicer cache + slicer per requested field ────────────────────────

function buildSlicerParts(
  fieldPlan: FieldPlan,
  pivotCacheIdExt: number,
  sheetTabId: number,
  pivotTableName: string,
  slicerIndex: number,
) {
  const safe = fieldPlan.spec.name.replace(/[^A-Za-z0-9_]/g, "_");
  const cacheName = `Slicer_${safe}_${slicerIndex}`;
  const slicerName = `${safe}Slicer${slicerIndex}`;

  const slicerCacheXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
    `<slicerCacheDefinition xmlns="${NS_X14}" name="${esc(cacheName)}" sourceName="${esc(fieldPlan.spec.name)}">` +
    `<pivotTables><pivotTable tabId="${sheetTabId}" name="${esc(pivotTableName)}"/></pivotTables>` +
    `<data><tabular pivotCacheId="${pivotCacheIdExt}">` +
    `<items count="${fieldPlan.distinct.length}">${fieldPlan.distinct.map((_, i) => `<i x="${i}" s="1"/>`).join("")}</items>` +
    `</tabular></data>` +
    `</slicerCacheDefinition>`;

  const slicerXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
    `<slicers xmlns="${NS_X14}">` +
    `<slicer name="${esc(slicerName)}" cache="${esc(cacheName)}" caption="${esc(fieldPlan.spec.name)}" rowHeight="241300"/>` +
    `</slicers>`;

  return { cacheName, slicerName, slicerCacheXml, slicerXml };
}

/** One slicer's floating position, stacked left to right along the top. */
function slicerAnchorXml(slicerName: string, colStart: number, uniqueId: number): string {
  const fromCol = colStart * 3;
  const toCol = fromCol + 2;
  return (
    `<xdr:twoCellAnchor editAs="oneCell">` +
    `<xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>19050</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>19050</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>10</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
    `<mc:AlternateContent xmlns:mc="${NS_MC}">` +
    `<mc:Choice xmlns:a14="${NS_A14}" Requires="a14">` +
    `<xdr:graphicFrame macro="">` +
    `<xdr:nvGraphicFramePr><xdr:cNvPr id="${uniqueId}" name="${esc(slicerName)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
    `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
    `<a:graphic><a:graphicData uri="${NS_SLE}"><sle:slicer xmlns:sle="${NS_SLE}" name="${esc(slicerName)}"/></a:graphicData></a:graphic>` +
    `</xdr:graphicFrame>` +
    `</mc:Choice>` +
    `<mc:Fallback>` +
    `<xdr:sp macro="" textlink="">` +
    `<xdr:nvSpPr><xdr:cNvPr id="0" name=""/><xdr:cNvSpPr><a:spLocks noTextEdit="1"/></xdr:cNvSpPr></xdr:nvSpPr>` +
    `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1905000" cy="2540000"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:solidFill><a:prstClr val="white"/></a:solidFill>` +
    `<a:ln w="1"><a:solidFill><a:prstClr val="green"/></a:solidFill></a:ln>` +
    `</xdr:spPr>` +
    `<xdr:txBody><a:bodyPr vertOverflow="clip" horzOverflow="clip"/><a:lstStyle/>` +
    `<a:p><a:r><a:rPr lang="en-IN" sz="1100"/><a:t>This shape represents a slicer. Slicers are supported in Excel 2010 or later.</a:t></a:r></a:p>` +
    `</xdr:txBody></xdr:sp>` +
    `</mc:Fallback>` +
    `</mc:AlternateContent>` +
    `<xdr:clientData/>` +
    `</xdr:twoCellAnchor>`
  );
}

// ─── stitching everything into the finished zip ───────────────────────────

/** A caller-stable id: same spec, same id, every run — nothing to keep track of. */
function stableId(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The next free `N` for parts named `prefixN.ext`, already in this zip. */
function nextFree(zip: JSZip, pattern: RegExp): number {
  const taken = Object.keys(zip.files)
    .map((n) => pattern.exec(n)?.[1])
    .filter((n): n is string => !!n)
    .map(Number);
  return (taken.length ? Math.max(...taken) : 0) + 1;
}

/**
 * Adds a PivotTable and its slicers to an already-built workbook, as a new
 * sheet. The workbook is otherwise untouched — same reasoning as
 * `injectCharts`: a post-processing step that rewrote cells is exactly how a
 * total ends up disagreeing between sheets.
 *
 * Safe to call more than once on the same (accumulating) buffer — see the
 * file header's "THIS FUNCTION IS CALLED MORE THAN ONCE PER WORKBOOK".
 */
export async function injectPivotTable(buffer: ArrayBuffer | Buffer, spec: PivotSpec): Promise<Buffer> {
  // ── NO ROWS TO PIVOT IS NOT AN ERROR ──────────────────────────────────
  //
  // An empty period, or a row field that is null on everything the viewer
  // may see, leaves nothing to put down the side. A pivot table with no
  // row items is a part Excel will not accept, so the table is simply not
  // added and the rest of the workbook — figures, charts, the Data sheet —
  // is handed back untouched. Same reasoning as the slicer filter below:
  // the export must survive thin data, because thin data is normal.
  if (!spec.rows.length) return Buffer.from(buffer as ArrayBuffer);

  const zip = await JSZip.loadAsync(buffer);

  const pivotTableName = spec.pivotTableName ?? "Pivot1";
  const pivotCacheIdExt = stableId(
    `${spec.sourceSheet}:${spec.sourceRef}:${spec.rowFields.join(">")}:${spec.colField ?? ""}:${spec.dataFields.map((d) => d.field).join(",")}`,
  );

  // ── which sheetId / part numbers are already taken ──────────────────────
  const wbXmlBefore = await zip.file("xl/workbook.xml")!.async("string");
  const takenSheetIds = [...wbXmlBefore.matchAll(/<sheet[^>]*sheetId="(\d+)"/g)].map((m) => Number(m[1]));
  const sheetTabId = (takenSheetIds.length ? Math.max(...takenSheetIds) : 0) + 1;
  const takenWbCacheIds = [...wbXmlBefore.matchAll(/<pivotCache cacheId="(\d+)"/g)].map((m) => Number(m[1]));
  const cacheId = (takenWbCacheIds.length ? Math.max(...takenWbCacheIds) : -1) + 1;

  const drawingNum = nextFree(zip, /^xl\/drawings\/drawing(\d+)\.xml$/);
  const sheetFileNum = nextFree(zip, /^xl\/worksheets\/sheet(\d+)\.xml$/);
  const pivotCacheNum = nextFree(zip, /^xl\/pivotCache\/pivotCacheDefinition(\d+)\.xml$/);
  const pivotTableNum = nextFree(zip, /^xl\/pivotTables\/pivotTable(\d+)\.xml$/);
  const slicerCacheStart = nextFree(zip, /^xl\/slicerCaches\/slicerCache(\d+)\.xml$/);
  const slicerStart = nextFree(zip, /^xl\/slicers\/slicer(\d+)\.xml$/);
  // A stable-across-calls seed for drawing shape ids, so two pivots in one
  // workbook never reuse the same `<xdr:cNvPr id="...">`.
  const shapeIdBase = 100 + (sheetFileNum - 1) * 20;

  // ── the pivot cache + pivot table ────────────────────────────────────────
  const built = buildPivotParts(
    spec,
    pivotCacheIdExt,
    cacheId,
    sheetTabId,
    pivotTableName,
  );
  // Nothing to put down the side — hand the workbook back as it came.
  if (!built) return Buffer.from(buffer as ArrayBuffer);
  const { plans, cacheDef, recordsXml, pivotTableXml } = built;

  zip.file(`xl/pivotCache/pivotCacheDefinition${pivotCacheNum}.xml`, cacheDef);
  zip.file(`xl/pivotCache/pivotCacheRecords${pivotCacheNum}.xml`, recordsXml);
  zip.file(
    `xl/pivotCache/_rels/pivotCacheDefinition${pivotCacheNum}.xml.rels`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${REL_PIVOT_CACHE_REC}" Target="pivotCacheRecords${pivotCacheNum}.xml"/></Relationships>`,
  );
  zip.file(`xl/pivotTables/pivotTable${pivotTableNum}.xml`, pivotTableXml);
  zip.file(
    `xl/pivotTables/_rels/pivotTable${pivotTableNum}.xml.rels`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${REL_PIVOT_CACHE_DEF}" Target="../pivotCache/pivotCacheDefinition${pivotCacheNum}.xml"/></Relationships>`,
  );

  // ── the slicers, one per requested field ────────────────────────────────
  const slicerCacheFiles: { fileName: string; xml: string; cacheName: string }[] = [];
  const slicerFiles: { fileName: string; xml: string; slicerName: string }[] = [];
  const anchors: string[] = [];
  const definedNames: string[] = [];

  // ── A MISCONFIGURED FIELD THROWS. AN EMPTY ONE IS JUST SKIPPED. ────────
  //
  // These are two different things and treating them the same took a whole
  // report down. A field NAME that is not on the report is a coding
  // mistake and must fail loudly. A field that exists and happens to hold
  // nothing in THIS period is ordinary data — Help Slip's "Waiting on" is
  // null on every visible concern, and throwing for it meant the entire
  // workbook failed with "That report could not be produced. Please try a
  // narrower period", which is advice that could not have helped: a
  // narrower period empties MORE fields, not fewer.
  //
  // Filtered BEFORE the loop so the surviving slicers stay contiguously
  // numbered — indexing off the original array would leave a gap in the
  // part names and the relationship ids.
  const usableSlicers = spec.slicerFields.filter((fieldName) => {
    const plan = plans.find((p) => p.spec.name === fieldName);
    if (!plan) throw new Error(`pivot: slicer field "${fieldName}" is not in fields`);
    if (plan.spec.kind !== "text") throw new Error(`pivot: slicer field "${fieldName}" must be a text field`);
    return plan.distinct.length > 0;
  });

  usableSlicers.forEach((fieldName, i) => {
    const plan = plans.find((p) => p.spec.name === fieldName)!;
    const n = slicerCacheStart + i;
    const sn = slicerStart + i;
    const built = buildSlicerParts(plan, pivotCacheIdExt, sheetTabId, pivotTableName, n);
    slicerCacheFiles.push({ fileName: `xl/slicerCaches/slicerCache${n}.xml`, xml: built.slicerCacheXml, cacheName: built.cacheName });
    slicerFiles.push({ fileName: `xl/slicers/slicer${sn}.xml`, xml: built.slicerXml, slicerName: built.slicerName });
    anchors.push(slicerAnchorXml(built.slicerName, i, shapeIdBase + i));
    definedNames.push(`<definedName name="${esc(built.cacheName)}">#N/A</definedName>`);
  });

  slicerCacheFiles.forEach((f) => zip.file(f.fileName, f.xml));
  slicerFiles.forEach((f) => zip.file(f.fileName, f.xml));

  // ── the new sheet: dimension covers pivot table + slicer row band ───────
  const pivotSheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
    `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_R}"><dimension ref="A1"/><sheetData/>` +
    `<drawing r:id="rIdDrawing"/>` +
    (slicerFiles.length
      ? `<extLst><ext uri="{A8765BA9-456A-4dab-B4F3-ACF838C121DE}" xmlns:x14="${NS_X14}"><x14:slicerList>` +
        slicerFiles.map((_, i) => `<x14:slicer r:id="rIdSlicer${i + 1}"/>`).join("") +
        `</x14:slicerList></ext></extLst>`
      : "") +
    `</worksheet>`;
  const pivotSheetFile = `xl/worksheets/sheet${sheetFileNum}.xml`;
  zip.file(pivotSheetFile, pivotSheetXml);

  const drawingXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
    `<xdr:wsDr xmlns:xdr="${NS_XDR}" xmlns:a="${NS_A}">${anchors.join("")}</xdr:wsDr>`;
  zip.file(`xl/drawings/drawing${drawingNum}.xml`, drawingXml);

  const pivotSheetRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rIdPivotTable" Type="${REL_PIVOT_TABLE}" Target="../pivotTables/pivotTable${pivotTableNum}.xml"/>` +
    `<Relationship Id="rIdDrawing" Type="${REL_DRAWING}" Target="../drawings/drawing${drawingNum}.xml"/>` +
    slicerFiles.map((f, i) => `<Relationship Id="rIdSlicer${i + 1}" Type="${REL_SLICER}" Target="../slicers/${f.fileName.split("/").pop()}"/>`).join("") +
    `</Relationships>`;
  zip.file(`xl/worksheets/_rels/sheet${sheetFileNum}.xml.rels`, pivotSheetRels);

  // ── workbook.xml: the sheet tab, definedNames, pivotCaches, extLst ──────
  let wbXml = wbXmlBefore;
  wbXml = wbXml.replace(
    /<\/sheets>/,
    `<sheet sheetId="${sheetTabId}" name="${esc(spec.pivotSheetName)}" state="visible" r:id="rIdPivotSheet${sheetFileNum}"/></sheets>`,
  );
  if (definedNames.length) {
    if (/<definedNames>/.test(wbXml)) {
      wbXml = wbXml.replace(/<\/definedNames>/, `${definedNames.join("")}</definedNames>`);
    } else {
      wbXml = wbXml.replace(/(<\/sheets>)/, `$1<definedNames>${definedNames.join("")}</definedNames>`);
    }
  }
  const pivotCacheEntry = `<pivotCache cacheId="${cacheId}" r:id="rIdPivotCache${pivotCacheNum}"/>`;
  if (/<pivotCaches>/.test(wbXml)) {
    wbXml = wbXml.replace(/<\/pivotCaches>/, `${pivotCacheEntry}</pivotCaches>`);
  } else if (/<calcPr[^/]*\/>/.test(wbXml)) {
    wbXml = wbXml.replace(/(<calcPr[^/]*\/>)/, `$1<pivotCaches>${pivotCacheEntry}</pivotCaches>`);
  } else {
    // Some reports' workbooks may lack calcPr; append after sheets/definedNames instead.
    wbXml = wbXml.replace(/(<\/definedNames>|<\/sheets>)/, `$1<pivotCaches>${pivotCacheEntry}</pivotCaches>`);
  }
  if (slicerCacheFiles.length) {
    const refs = slicerCacheFiles
      .map((_, i) => `<x14:slicerCache r:id="rIdSlicerCache${slicerCacheStart + i}"/>`)
      .join("");
    if (/<x14:slicerCaches>/.test(wbXml)) {
      wbXml = wbXml.replace(/<\/x14:slicerCaches>/, `${refs}</x14:slicerCaches>`);
    } else {
      const ext = `<ext uri="{BBE1A952-AA13-448e-AADC-164F8A28A991}" xmlns:x14="${NS_X14}"><x14:slicerCaches>${refs}</x14:slicerCaches></ext>`;
      wbXml = /<extLst>/.test(wbXml)
        ? wbXml.replace(/<\/extLst>/, `${ext}</extLst>`)
        : wbXml.replace(/<\/workbook>/, `<extLst>${ext}</extLst></workbook>`);
    }
  }
  zip.file("xl/workbook.xml", wbXml);

  // ── workbook.xml.rels ────────────────────────────────────────────────────
  let wbRels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const newRels =
    `<Relationship Id="rIdPivotSheet${sheetFileNum}" Type="${REL_WORKSHEET}" Target="worksheets/sheet${sheetFileNum}.xml"/>` +
    `<Relationship Id="rIdPivotCache${pivotCacheNum}" Type="${REL_PIVOT_CACHE_DEF}" Target="pivotCache/pivotCacheDefinition${pivotCacheNum}.xml"/>` +
    slicerCacheFiles
      .map((f, i) => `<Relationship Id="rIdSlicerCache${slicerCacheStart + i}" Type="${REL_SLICER_CACHE}" Target="slicerCaches/${f.fileName.split("/").pop()}"/>`)
      .join("");
  wbRels = wbRels.replace("</Relationships>", `${newRels}</Relationships>`);
  zip.file("xl/_rels/workbook.xml.rels", wbRels);

  // ── content types ────────────────────────────────────────────────────────
  let ct = await zip.file("[Content_Types].xml")!.async("string");
  const ctAdds =
    `<Override PartName="/${pivotSheetFile}" ContentType="${CT_WORKSHEET}"/>` +
    `<Override PartName="/xl/pivotCache/pivotCacheDefinition${pivotCacheNum}.xml" ContentType="${CT_PIVOT_CACHE_DEF}"/>` +
    `<Override PartName="/xl/pivotCache/pivotCacheRecords${pivotCacheNum}.xml" ContentType="${CT_PIVOT_CACHE_REC}"/>` +
    `<Override PartName="/xl/pivotTables/pivotTable${pivotTableNum}.xml" ContentType="${CT_PIVOT_TABLE}"/>` +
    `<Override PartName="/xl/drawings/drawing${drawingNum}.xml" ContentType="${CT_DRAWING}"/>` +
    slicerCacheFiles.map((f) => `<Override PartName="/${f.fileName}" ContentType="${CT_SLICER_CACHE}"/>`).join("") +
    slicerFiles.map((f) => `<Override PartName="/${f.fileName}" ContentType="${CT_SLICER}"/>`).join("");
  ct = ct.replace("</Types>", `${ctAdds}</Types>`);
  zip.file("[Content_Types].xml", ct);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
