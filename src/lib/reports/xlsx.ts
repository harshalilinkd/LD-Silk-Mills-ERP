import ExcelJS from "exceljs";

import { C, buildDashboard } from "./dashboard";

import { excelFormat, excelWidth, isNumeric, isoToKolkata, plural, unitFormat } from "./format";
import { excelImageKind, fitBox, imageSize } from "./image-size";
import type {
  ReportAnalysis,
  ReportColumn,
  ReportDefinition,
  ReportImages,
  ReportParams,
  ReportRow,
} from "./types";
import { injectCharts } from "./xlsx-charts";
import { injectPivotTable, type PivotFieldSpec } from "./xlsx-pivot";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The workbook: a dashboard, the data, and the small print
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Three sheets, in the order somebody actually uses them.
 *
 *   · **Dashboard** — one screen. KPI cards, a trend, ranked lists, and the
 *     insights written as sentences. Whoever opens this file sees the answer
 *     before they see a row.
 *   · **Data** — every row, as a real Excel table: frozen header, filter
 *     buttons, right-aligned money, totals at the foot.
 *   · **Notes** — the filters that were applied, when it was run and by whom,
 *     what each column means, and the caveats that apply to these figures.
 *
 * The Dashboard is built by `./dashboard.ts` — it grew into the part that
 * decides whether anybody reads the file, and it earns its own module. This
 * one owns the two sheets that are about the DATA rather than about reading
 * it.
 */

const HEAD = "Aptos Display";
const BODY = "Aptos Narrow";

function fill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

// ─── the data sheet ───────────────────────────────────────────────────────

function buildData(
  wb: ExcelJS.Workbook,
  columns: ReportColumn[],
  rows: ReportRow[],
) {
  const ws = wb.addWorksheet("Data", {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = columns.map((c) => ({
    header: c.label,
    key: c.key,
    width: excelWidth(c),
    style: {
      numFmt: unitFormat(c),
      alignment: { horizontal: isNumeric(c.type) ? "right" : "left" },
    },
  }));

  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell((cell) => {
    cell.font = { name: BODY, size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    fill(cell, C.indigo);
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
  for (const row of rows) {
    const out: Record<string, unknown> = {};
    for (const c of columns) {
      const v = row[c.key];
      if (v === null || v === undefined) {
        out[c.key] = null;
      } else if (c.type === "date") {
        // A real date cell, not text — so Excel can group and sort by month.
        out[c.key] = new Date(`${String(v).slice(0, 10)}T00:00:00Z`);
      } else if (c.type === "datetime") {
        const t = Date.parse(String(v));
        out[c.key] = Number.isFinite(t)
          ? new Date(t + 5.5 * 3_600_000) // IST, so the cell reads like the app
          : isoToKolkata(String(v));
      } else if (c.type === "boolean") {
        out[c.key] = v ? "Yes" : "No";
      } else if (isNumeric(c.type)) {
        out[c.key] = Number(v);
      } else {
        out[c.key] = String(v);
      }
    }
    ws.addRow(out);
  }

  // Over the header AND every data row. Set here rather than before the rows
  // are added, because `to: { row: 1 }` produced ref="A1:AM1" — buttons that
  // filtered nothing. It deliberately stops above the Total row.
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length + 1), column: columns.length },
  };

  // ── STATUS BADGES ────────────────────────────────────────────────────
  //
  // A tinted cell with the word still in it, not an icon: it survives a filter,
  // a print, a paste into another sheet, and somebody who is colour-blind still
  // reads the word. Applied before the banding so the banding does not paint
  // over it.
  const BADGE: Record<string, { fg: string; bg: string }> = {
    good: { fg: C.green, bg: C.greenDim },
    warn: { fg: C.amber, bg: C.amberDim },
    bad: { fg: C.red, bg: C.redDim },
    neutral: { fg: C.ink3, bg: C.paper },
  };
  const badged = columns
    .map((c, i) => ({ c, i: i + 1 }))
    .filter((x) => x.c.badge);
  for (const { c, i } of badged) {
    for (let rr = 2; rr <= rows.length + 1; rr++) {
      const cell = ws.getCell(rr, i);
      const tone = c.badge?.[String(cell.value ?? "")];
      if (!tone) continue;
      const b = BADGE[tone];
      fill(cell, b.bg);
      cell.font = { name: BODY, size: 9, bold: tone !== "neutral", color: { argb: b.fg } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }
  }

  // Banding, so the eye keeps its place across thirty columns.
  const badgedCols = new Set(badged.map((x) => x.i));
  for (let i = 2; i <= rows.length + 1; i += 2) {
    ws.getRow(i).eachCell({ includeEmpty: true }, (cell, col) => {
      if (!badgedCols.has(col)) fill(cell, C.paper);
    });
  }

  // ── the Total row ──────────────────────────────────────────────────────
  //
  // Only what is genuinely additive, and averages RECOMPUTED rather than
  // added. See `ReportColumn.total` for why this needed spelling out.
  //
  // Every formula is SUBTOTAL, not SUM, so the footer follows the filter
  // buttons: filter to one customer and the total becomes that customer's.
  if (rows.length) {
    const last = rows.length + 1;
    const letterOf = (key: string) => {
      const i = columns.findIndex((c) => c.key === key);
      return i < 0 ? null : ws.getColumn(i + 1).letter;
    };

    // The word "Total" goes in the first column that is NOT a figure. Putting
    // it in column 1 regardless meant Work in Progress — whose first column is
    // "Days open", so the oldest sorts to the top — printed the word "Total"
    // over a numeric column and lost that column's average entirely.
    const labelAt = Math.max(
      0,
      columns.findIndex((c) => !isNumeric(c.type)),
    );

    const totalRow = ws.addRow({});
    totalRow.height = 20;
    columns.forEach((c, i) => {
      const cell = totalRow.getCell(i + 1);
      cell.font = { name: BODY, size: 9.5, bold: true, color: { argb: C.ink } };
      cell.border = { top: { style: "medium", color: { argb: C.indigo } } };
      if (i === labelAt) {
        cell.value = "Total";
        return;
      }

      const how = c.total ?? (isNumeric(c.type) ? "sum" : "none");
      if (how === "none") return;

      const col = ws.getColumn(i + 1).letter;
      if (how === "sum") {
        cell.value = { formula: `SUBTOTAL(109,${col}2:${col}${last})` };
        cell.numFmt = excelFormat(c.type) ?? "#,##0.00";
        return;
      }

      // An average across the whole file. Weighted where the weight column
      // exists — a rate is total value over total metres, never the mean of
      // the rates, which would let a 50-metre line count as much as a
      // 5,000-metre one.
      const w = c.avgWeightBy ? letterOf(c.avgWeightBy) : null;
      cell.value = w
        ? {
            formula:
              `IFERROR(SUMPRODUCT(SUBTOTAL(109,OFFSET(${col}2,ROW(${col}2:${col}${last})-ROW(${col}2),0)),` +
              `${w}2:${w}${last})/SUBTOTAL(109,${w}2:${w}${last}),"")`,
          }
        : { formula: `IFERROR(SUBTOTAL(101,${col}2:${col}${last}),"")` };
      // An `int` column formats as `#,##0`, which rounds the average away —
      // 3.89 stages printed as "4", which is the one digit that made it an
      // average rather than a count.
      cell.numFmt = c.type === "int" ? "#,##0.0" : (excelFormat(c.type) ?? "#,##0.00");
    });

    // Said out loud, because a blank cell under a column of numbers otherwise
    // looks like something failed to calculate.
    const noteRow = ws.addRow({});
    const note = noteRow.getCell(1);
    note.value =
      "This row follows the filter buttons. A cell holding an AVERAGE rather than a total is marked in the column notes on the Notes sheet. " +
      "A BLANK cell is a column that cannot honestly be added up or averaged — a count of distinct things, or a share that is already a share.";
    note.font = { name: BODY, size: 8.5, italic: true, color: { argb: C.ink3 } };
    ws.mergeCells(noteRow.number, 1, noteRow.number, Math.min(columns.length, 12));
  }
}

// --- the receipts sheet ---------------------------------------------------

/**
 * ===========================================================================
 *  The bills themselves
 * ===========================================================================
 *
 * One row per attachment: the entry it belongs to, then the picture. The
 * owner's words were that the Receipt column showed "only the attached image
 * name, not the actual image" - this is the actual image, and `ReportImages`
 * in `types.ts` records why it is a sheet of its own rather than a tall cell
 * on the Data sheet (short version: a floating picture does not move when a
 * range is sorted, and a receipt over the wrong payment is worse than none).
 *
 * -- IT IS CAPPED, AND IT SAYS SO ------------------------------------------
 *
 * An embedded picture is stored WHOLE. Excel scales it for display; the bytes
 * are the bytes, so fifty phone photographs of bills is a fifty-megabyte
 * workbook nobody can mail. There is no rasteriser here to shrink them with -
 * the same reason chart images were refused - so the honest control is a
 * budget, loudly declared: the first MAX_IMAGES of them, and never more than
 * MAX_BYTES in total. What did not fit is counted on the sheet, with where to
 * find it.
 *
 * A file that is not a picture - a PDF bill, a scanned .tif - gets its line
 * and says what it is. Nothing is silently dropped.
 */
const RECEIPTS_SHEET = "Receipts";
/** Pixels. Wide enough to read a printed amount, short enough to scroll. */
const IMAGE_BOX = { width: 260, height: 150 };
/**
 * ── THE BUDGET IS SET BY THE PLATFORM, NOT BY TASTE ──────────────────────
 *
 * The export route hands the WHOLE workbook back as one response body, and
 * **Vercel refuses a serverless response over 4.5 MB** (FUNCTION_PAYLOAD_TOO
 * _LARGE) — the response-side twin of the 4.5 MB request cap that already
 * forced petty cash uploads to go browser-to-storage.
 *
 * The first version of this sheet budgeted 20 MB of source bytes. Every local
 * test passed, because `toWorkbook()` and a curl against localhost have no
 * such limit: one 1.53 MB receipt produced a 1.54 MB workbook and looked fine.
 * THREE receipts of that size would have been a broken download in front of
 * the MD, on a module about to be handed to six people.
 *
 * A picture is already compressed, so the zip does not shrink it — the
 * finished workbook is roughly the images plus the sheets. 3 MB of pictures
 * therefore leaves a megabyte under the ceiling for even the widest report's
 * data.
 *
 * `toWorkbook` re-checks the FINISHED file as a last resort, but that fallback
 * drops EVERY picture — so this budget, which drops only the tail, has to be
 * the thing that normally decides. A budget so tight the guard never gets
 * close is not caution, it is receipts thrown away for nothing.
 */
const MAX_IMAGES = 60;
const MAX_BYTES = 3 * 1024 * 1024;
/** How many receipts to pull from storage at once. */
const FETCH_CONCURRENCY = 6;

/**
 * What the platform will actually hand back in one response.
 *
 * Vercel's cap is 4.5 MB; this sits under it because the measurement here is
 * the zip and the response also carries headers. A file over this is rebuilt
 * without its pictures rather than sent and refused.
 */
const RESPONSE_CEILING = 4 * 1024 * 1024;

async function buildReceipts(
  wb: ExcelJS.Workbook,
  columns: ReportColumn[],
  rows: ReportRow[],
  images: ReportImages,
): Promise<void> {
  // Only the columns the report asked for, in the order it asked for them,
  // and only the ones it actually has.
  const beside = images.columns
    .map((k) => columns.find((c) => c.key === k))
    .filter((c): c is ReportColumn => !!c);

  type Job = { row: ReportRow; name: string; ref: string; mime: string | null };
  const jobs: Job[] = [];
  for (const row of rows) {
    const key = String(row[images.rowKey] ?? "");
    for (const f of images.byRow[key] ?? []) {
      jobs.push({ row, name: f.name, ref: f.ref, mime: f.mime });
    }
  }
  if (!jobs.length) return;

  const ws = wb.addWorksheet(RECEIPTS_SHEET, {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  beside.forEach((c, i) => {
    ws.getColumn(i + 1).width = excelWidth(c);
  });
  const fileCol = beside.length + 1;
  const imgCol = beside.length + 2;
  ws.getColumn(fileCol).width = 28;
  // About 7 pixels to the character, plus a margin either side of the box.
  ws.getColumn(imgCol).width = Math.ceil(IMAGE_BOX.width / 7) + 2;

  const header = ws.getRow(1);
  header.height = 22;
  [...beside.map((c) => c.label), "File", "Receipt"].forEach((label, i) => {
    const cell = header.getCell(i + 1);
    cell.value = label;
    cell.font = { name: BODY, size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    fill(cell, C.indigo);
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });

  let r = 2;
  let drawn = 0;
  let bytes = 0;
  let skippedForBudget = 0;
  const notPictures: string[] = [];

  // ── FETCHED IN PARALLEL, NOT ONE AT A TIME ────────────────────────────
  //
  // This used to await each receipt inside the drawing loop, so a period with
  // sixty of them made sixty round trips to storage END TO END while a
  // serverless function's clock ran. The pictures are independent of each
  // other and of the rows, so they are pulled in small concurrent batches
  // first and drawn afterwards. Batches rather than one big Promise.all
  // because the BUDGET has to stop the fetching: past it there is nothing to
  // be gained by reading bytes we are not going to embed.
  const fetched = new Map<string, Buffer>();
  {
    const wanted = jobs.filter((j) => excelImageKind(j.mime, j.name));
    for (let i = 0; i < wanted.length && fetched.size < MAX_IMAGES; i += FETCH_CONCURRENCY) {
      if (bytes >= MAX_BYTES) break;
      const batch = wanted.slice(i, i + FETCH_CONCURRENCY);
      const got = await Promise.all(
        batch.map(async (j) => {
          try {
            return [j.ref, await images.load(j.ref)] as const;
          } catch {
            // A receipt the bucket will not hand back is a line on the sheet,
            // not a failed export. The rest of the pack is still correct.
            return [j.ref, null] as const;
          }
        }),
      );
      for (const [ref, data] of got) {
        if (!data) continue;
        // The first picture always goes in, whatever it weighs: a single
        // oversized scan should arrive alone rather than leave the sheet
        // empty with nothing to explain it.
        if (fetched.size > 0 && bytes + data.length > MAX_BYTES) continue;
        if (fetched.size >= MAX_IMAGES) break;
        fetched.set(ref, data);
        bytes += data.length;
      }
    }
  }

  for (const job of jobs) {
    const kind = excelImageKind(job.mime, job.name);
    const data = kind ? (fetched.get(job.ref) ?? null) : null;
    if (!kind) notPictures.push(job.name);
    else if (!data) skippedForBudget++;

    const row = ws.getRow(r);
    beside.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = job.row[c.key];
      if (v === null || v === undefined) cell.value = null;
      else if (c.type === "date") cell.value = new Date(`${String(v).slice(0, 10)}T00:00:00Z`);
      else if (c.type === "boolean") cell.value = v ? "Yes" : "No";
      else if (isNumeric(c.type)) cell.value = Number(v);
      else cell.value = String(v);
      const fmt = unitFormat(c);
      if (fmt) cell.numFmt = fmt;
      cell.font = { name: BODY, size: 9.5, color: { argb: C.ink2 } };
      cell.alignment = { vertical: "middle", horizontal: isNumeric(c.type) ? "right" : "left" };
    });

    const nameCell = row.getCell(fileCol);
    nameCell.value = job.name;
    nameCell.font = { name: BODY, size: 9, color: { argb: C.ink2 } };
    nameCell.alignment = { vertical: "middle", wrapText: true };

    if (data && kind) {
      const fit = fitBox(imageSize(data), IMAGE_BOX);
      const id = wb.addImage({ buffer: data as unknown as ExcelJS.Buffer, extension: kind });
      ws.addImage(id, {
        // Zero-based, and a fraction of a cell in from the corner so the
        // picture does not sit on the gridline of the column beside it.
        tl: { col: imgCol - 1 + 0.06, row: r - 1 + 0.06 },
        ext: { width: fit.width, height: fit.height },
      } as unknown as Parameters<ExcelJS.Worksheet["addImage"]>[1]);
      // Points, not pixels: 0.75 pt to the pixel, plus a little air.
      row.height = Math.max(20, Math.round(fit.height * 0.75) + 8);
      drawn++;
    } else {
      const cell = row.getCell(imgCol);
      cell.value = !kind
        ? "Not a picture Excel can draw — open this one in the app"
        : "Left out to keep this file inside what the server will send — open it in the app";
      cell.font = { name: BODY, size: 9, italic: true, color: { argb: C.ink3 } };
      cell.alignment = { vertical: "middle", wrapText: true };
      row.height = 20;
    }

    if (r % 2 === 1) {
      for (let c = 1; c <= imgCol; c++) {
        const cell = row.getCell(c);
        if (!cell.fill) fill(cell, C.paper);
      }
    }
    r++;
  }

  // -- SAY WHAT IS NOT HERE ------------------------------------------------
  const said: string[] = [plural(drawn, "receipt") + " drawn on this sheet."];
  if (skippedForBudget) {
    said.push(
      `${plural(skippedForBudget, "picture")} left out. A receipt is stored at full size — there is nothing here that can shrink one — and the server will not send a file much past 4 MB, so this sheet stops at ${Math.round((MAX_BYTES / (1024 * 1024)) * 10) / 10} MB of pictures. Open those entries in Petty Cash to see them.`,
    );
  }
  if (notPictures.length) {
    const kinds = [...new Set(notPictures.map((n) => n.split(".").pop()?.toUpperCase() ?? "?"))];
    said.push(
      `${plural(notPictures.length, "attachment")} is not a picture Excel can draw (${kinds.join(", ")}). They are listed above and open in the app.`,
    );
  }
  said.push(
    "Each picture belongs to the reference on its own row. They are deliberately NOT on the Data sheet: Excel does not move a floating picture when a range is sorted, so one sort would put every receipt over the wrong entry.",
  );

  ws.mergeCells(r + 1, 1, r + 1, Math.max(2, imgCol));
  const note = ws.getCell(r + 1, 1);
  note.value = said.join("  ");
  note.font = { name: BODY, size: 8.5, italic: true, color: { argb: C.ink2 } };
  note.alignment = { wrapText: true, vertical: "top" };
  ws.getRow(r + 1).height = 44;
}

// ─── the pivot table + slicers, if this report asked for one ──────────────

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Builds the hidden "Pivot data" sheet every pivot table in this report
 * sources from, and injects each table in turn.
 *
 * ── WHY A SEPARATE SHEET, NOT THE VISIBLE DATA SHEET ─────────────────────
 *
 * A pivot cache's `worksheetSource` must point at REAL cells — with
 * `refreshOnLoad="1"` set, Excel re-reads that range the moment the file is
 * opened, so anything the cache "knows" that is not actually sitting in
 * those cells gets silently wiped on the first refresh. Two things a pivot
 * commonly needs are NOT on the Data sheet: a derived field (Year, Month, a
 * Completed/In Process/Cancelled status) the report computed but has no
 * reason to show as its own column, and — when several pivots want
 * different fields — a column ORDER matching each pivot's own field list
 * rather than the Data sheet's. Following the same house pattern as the
 * hidden "Chart data" sheet the Dashboard already uses for exactly this
 * reason: real cells, real numbers, just not on the sheet a person reads.
 */
type PivotDataPlan = {
  referenced: string[];
  fieldSpecs: PivotFieldSpec[];
  pivotRows: (string | number | null)[][];
  labelOf: (key: string) => string;
};

function planPivotData(
  columns: ReportColumn[],
  rows: ReportRow[],
  pivots: NonNullable<ReportAnalysis["pivots"]>,
): PivotDataPlan {
  const extraFields = pivots.extraFields ?? [];
  for (const ef of extraFields) {
    if (ef.values.length !== rows.length) {
      throw new Error(`pivot: extraField "${ef.name}" has ${ef.values.length} values for ${rows.length} rows`);
    }
  }

  // Every field ANY table references, real column or extra field, in the
  // order first referenced — that order becomes the hidden sheet's columns.
  const referenced: string[] = [];
  const seen = new Set<string>();
  const note = (key: string) => {
    if (!seen.has(key)) { seen.add(key); referenced.push(key); }
  };
  for (const t of pivots.tables) {
    for (const r of t.rowFields) note(r);
    if (t.colField) note(t.colField);
    for (const d of t.dataFields) note(d.field);
    for (const s of t.slicerFields) note(s);
  }

  const colByKey = new Map(columns.map((c) => [c.key, c]));
  const extraByName = new Map(extraFields.map((e) => [e.name, e]));

  const fieldSpecs: PivotFieldSpec[] = referenced.map((key) => {
    const c = colByKey.get(key);
    if (c) return { name: c.label, kind: isNumeric(c.type) ? "number" : "text" };
    if (extraByName.has(key)) return { name: key, kind: "text" };
    throw new Error(`pivot: field "${key}" is neither a report column nor a declared extraField`);
  });
  const labelOf = (key: string): string => {
    const c = colByKey.get(key);
    return c ? c.label : key;
  };

  const pivotRows = rows.map((row, i) =>
    referenced.map((key) => {
      const c = colByKey.get(key);
      if (c) {
        const v = row[c.key];
        if (v === null || v === undefined) return null;
        if (isNumeric(c.type)) return Number(v);
        if (c.type === "boolean") return v ? "Yes" : "No";
        if (c.type === "date") return String(v).slice(0, 10);
        return String(v);
      }
      return extraByName.get(key)!.values[i];
    }),
  );

  return { referenced, fieldSpecs, pivotRows, labelOf };
}

const PIVOT_DATA_SHEET = "Pivot data";

/**
 * Builds the hidden "Pivot data" sheet every pivot table in this report
 * sources from. Must run BEFORE `wb.xlsx.writeBuffer()` — this adds real
 * cells to the live ExcelJS workbook, not to an already-serialized zip.
 *
 * ── WHY A SEPARATE SHEET, NOT THE VISIBLE DATA SHEET ─────────────────────
 *
 * A pivot cache's `worksheetSource` must point at REAL cells — with
 * `refreshOnLoad="1"` set, Excel re-reads that range the moment the file is
 * opened, so anything the cache "knows" that is not actually sitting in
 * those cells gets silently wiped on the first refresh. Two things a pivot
 * commonly needs are NOT on the Data sheet: a derived field (Year, Month, a
 * Completed/In Process/Cancelled status) the report computed but has no
 * reason to show as its own column, and — when several pivots want
 * different fields — a column ORDER matching each pivot's own field list
 * rather than the Data sheet's. Following the same house pattern as the
 * hidden "Chart data" sheet the Dashboard already uses for exactly this
 * reason: real cells, real numbers, just not on the sheet a person reads.
 */
function buildPivotDataSheet(wb: ExcelJS.Workbook, plan: PivotDataPlan): void {
  const ws = wb.addWorksheet(PIVOT_DATA_SHEET, { state: "hidden" });
  ws.addRow(plan.fieldSpecs.map((f) => f.name));
  for (const r of plan.pivotRows) ws.addRow(r);
}

/** Injects every pivot table this report declared, chaining the buffer
 * through one `injectPivotTable` call per table — see `xlsx-pivot.ts`'s
 * file header for why this function is safe to call more than once. */
async function injectPivotsInto(
  buffer: Buffer,
  rows: ReportRow[],
  pivots: NonNullable<ReportAnalysis["pivots"]>,
  plan: PivotDataPlan,
): Promise<Buffer> {
  let out = buffer;
  for (const t of pivots.tables) {
    out = await injectPivotTable(out, {
      sourceSheet: PIVOT_DATA_SHEET,
      sourceRef: `A1:${colLetter(plan.referenced.length)}${rows.length + 1}`,
      fields: plan.fieldSpecs,
      rows: plan.pivotRows,
      rowFields: t.rowFields.map(plan.labelOf),
      colField: t.colField ? plan.labelOf(t.colField) : undefined,
      dataFields: t.dataFields.map((d) => {
        const verb = d.aggregate === "count" ? "Count" : d.aggregate === "average" ? "Average" : "Sum";
        return {
          field: plan.labelOf(d.field),
          aggregate: d.aggregate,
          label: d.label ?? `${verb} of ${plan.labelOf(d.field).toLowerCase()}`,
        };
      }),
      slicerFields: t.slicerFields.map(plan.labelOf),
      pivotSheetName: t.sheetName,
      pivotTableName: t.pivotTableName,
    });
  }
  return out;
}

// ─── the notes sheet ──────────────────────────────────────────────────────

function buildNotes(
  wb: ExcelJS.Workbook,
  report: ReportDefinition,
  params: ReportParams,
  analysis: ReportAnalysis,
  meta: { runBy: string; runAt: Date; rowsShown: number; totalRows: number },
  filterLabels: Record<string, string> = {},
) {
  const ws = wb.addWorksheet("Notes", { views: [{ showGridLines: false }] });
  ws.getColumn(1).width = 2.2;
  ws.getColumn(2).width = 26;
  ws.getColumn(3).width = 82;

  let r = 2;
  const heading = (text: string) => {
    ws.mergeCells(r, 2, r, 3);
    const c = ws.getCell(r, 2);
    c.value = text;
    c.font = { name: HEAD, size: 13, bold: true, color: { argb: C.ink } };
    ws.getRow(r).height = 24;
    r += 1;
  };
  const line = (label: string, value: string) => {
    const a = ws.getCell(r, 2);
    a.value = label;
    a.font = { name: BODY, size: 9.5, bold: true, color: { argb: C.ink3 } };
    a.alignment = { vertical: "top" };
    const b = ws.getCell(r, 3);
    b.value = value;
    b.font = { name: BODY, size: 10, color: { argb: C.ink } };
    b.alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r).height = Math.max(16, Math.ceil(value.length / 92) * 14);
    r += 1;
  };

  heading(report.title);
  line("What it is", report.description);
  r += 1;

  heading("How this was run");
  line("Run by", meta.runBy);
  line("Run at", isoToKolkata(meta.runAt.toISOString()) + " (Asia/Kolkata)");
  line("Period", periodLabel(report, params));
  for (const f of report.filters) {
    if (f.kind === "dateRange") continue;
    const v = params[f.key];
    // The LABEL the person picked, not the code behind it. The cash book was
    // recording "DEBIT" for a filter the picker calls "Money out" and the Data
    // sheet also calls "Money out".
    if (v) line(f.label, filterLabels[f.key] ?? v);
  }
  line(
    "Rows",
    meta.rowsShown < meta.totalRows
      ? `${meta.rowsShown.toLocaleString("en-IN")} shown of ${meta.totalRows.toLocaleString("en-IN")} — TRUNCATED. Narrow the period and run it again for the rest.`
      : `${meta.rowsShown.toLocaleString("en-IN")}`,
  );
  r += 1;

  if (analysis.caveats.length) {
    heading("Caveats");
    for (const c of analysis.caveats) line("", c);
    r += 1;
  }

  heading("What each column means");
  for (const c of report.columns) {
    line(c.label, columnNote(c));
  }
}

/**
 * What the period line should say.
 *
 * One-sided ranges are real — the route accepts `from` without `to` and every
 * report applies each bound separately — so "Everything on record" was printed
 * over files that were filtered. It also names the DATE the filter is on,
 * which is the order date on one report and the call-due date on another.
 */
function periodLabel(report: ReportDefinition, params: ReportParams): string {
  const what = report.filters.find((f) => f.kind === "dateRange")?.label ?? "Date";
  const on = what.toLowerCase();
  if (params.from && params.to) return `${on} from ${params.from} to ${params.to}`;
  if (params.from) return `${on} from ${params.from} onwards`;
  if (params.to) return `${on} up to ${params.to}`;
  return "Everything on record";
}

/**
 * The column's own note, or a description of its type — and never one that
 * promises a total the footer does not produce.
 */
function columnNote(c: ReportColumn): string {
  const how = c.total ?? (isNumeric(c.type) ? "sum" : "none");
  const foot =
    how === "sum"
      ? " Added up at the foot."
      : how === "avg"
        ? c.avgWeightBy
          ? " The foot is a WEIGHTED average, not a total."
          : " The foot is an AVERAGE, not a total."
        : isNumeric(c.type)
          ? " Deliberately NOT totalled — adding this column up would not mean anything."
          : "";
  return (c.note ?? TYPE_NOTE[c.type] ?? "") + foot;
}

const TYPE_NOTE: Record<ReportColumn["type"], string> = {
  text: "Text.",
  int: "A whole count.",
  number: "A measured quantity.",
  money: "Rupees.",
  date: "A calendar day.",
  datetime: "A moment, in Asia/Kolkata time.",
  percent: "A percentage — 38.3 means 38.3%.",
  boolean: "Yes or No.",
};

// ─── the whole thing ──────────────────────────────────────────────────────

export async function toWorkbook(
  report: ReportDefinition,
  params: ReportParams,
  columns: ReportColumn[],
  rows: ReportRow[],
  analysis: ReportAnalysis,
  meta: { runBy: string; runAt: Date; totalRows: number },
  /** From `ReportResult.images`. Draws the Receipts sheet; CSV never sees it. */
  images?: ReportImages,
): Promise<Buffer> {
  const period =
    params.from && params.to ? `${params.from} to ${params.to}` : "everything on record";
  const subtitle =
    `${period}  ·  ${plural(rows.length, "row")}` +
    (rows.length < meta.totalRows ? ` of ${meta.totalRows.toLocaleString("en-IN")} (truncated)` : "") +
    `  ·  run ${isoToKolkata(meta.runAt.toISOString())}`;

  if (rows.length < meta.totalRows) {
    analysis = {
      ...analysis,
      caveats: [
        `Only the first ${rows.length.toLocaleString("en-IN")} of ${meta.totalRows.toLocaleString("en-IN")} rows are on the Data sheet — the file name says PARTIAL. Every figure on this Dashboard still covers all ${meta.totalRows.toLocaleString("en-IN")}, so the sheet and the dashboard describe different numbers of rows. Narrow the period and run it again for the rest.`,
        ...analysis.caveats,
      ],
    };
  }

  // Resolve the chosen option back to its label. Only for filters that were
  // actually applied, so an unfiltered run costs nothing.
  //
  // This runs BEFORE the dashboard, not after, because the dashboard prints
  // what was filtered across the top of the page. It used to be resolved
  // afterwards and never handed over, so every export — including one narrowed
  // to a single customer — said "No filters applied, this is the whole period"
  // above figures covering one party. That is the exact sentence the strip
  // exists to prevent.
  const filterLabels: Record<string, string> = {};
  const filterList: string[] = [];
  for (const f of report.filters) {
    const v = params[f.key];
    // The dates are already in the subtitle; repeating them reads as a
    // second, different filter.
    if (!v || f.kind === "dateRange") continue;
    let shown = String(v);
    if (f.options) {
      try {
        const found = (await f.options()).find((o) => o.value === v);
        if (found && found.label !== v) {
          filterLabels[f.key] = `${found.label} (${v})`;
          shown = found.label;
        }
      } catch {
        // A dropdown that cannot be resolved is not a reason to fail an export;
        // the raw value is still recorded.
      }
    }
    filterList.push(`${f.label}: ${shown}`);
  }

  const assemble = async (
    withImages: ReportImages | undefined,
    extraCaveat?: string,
  ): Promise<Buffer> => {
    const wb = new ExcelJS.Workbook();
    wb.creator = "LD Silk Mills ERP";
    wb.created = meta.runAt;
    wb.title = report.title;

    const a = extraCaveat
      ? { ...analysis, caveats: [extraCaveat, ...analysis.caveats] }
      : analysis;

    const charts = buildDashboard(wb, report.title, subtitle, a, filterList, {
      columns,
      rows,
    });
    buildData(wb, columns, rows);

    // After Data, before Notes: the annexure sits behind the table it belongs
    // to. It costs one storage read per receipt, so it is only reached when a
    // report actually declares attachments.
    if (withImages) await buildReceipts(wb, columns, rows, withImages);

    buildNotes(wb, report, params, a, {
      runBy: meta.runBy,
      runAt: meta.runAt,
      rowsShown: rows.length,
      totalRows: meta.totalRows,
    }, filterLabels);

    // The hidden data sheet a pivot table sources from must exist BEFORE the
    // workbook is serialized — everything after this point works on the
    // finished zip, the same as the charts below.
    const pivotPlan = a.pivots ? planPivotData(columns, rows, a.pivots) : null;
    if (pivotPlan) buildPivotDataSheet(wb, pivotPlan);

    // The charts are written into the FINISHED zip. ExcelJS has no chart API,
    // so the four OOXML parts a native chart needs are added afterwards - see
    // `xlsx-charts.ts`. Nothing else in the workbook is touched, which is the
    // point: a post-processing step that rewrote cells is exactly how a total
    // ends up disagreeing between the Data sheet and the Dashboard.
    const out = await wb.xlsx.writeBuffer();
    const withCharts = await injectCharts(out, "Dashboard", charts);
    return pivotPlan ? injectPivotsInto(withCharts, rows, a.pivots!, pivotPlan) : withCharts;
  };

  // ── THE FINISHED FILE IS MEASURED, NOT ESTIMATED ──────────────────────
  //
  // `MAX_BYTES` keeps the pictures inside a sensible budget, but a budget on
  // SOURCE bytes is a prediction about the finished file, and this is the one
  // place a prediction is not good enough: over the ceiling the platform does
  // not truncate the download, it replaces it with an error, and the person
  // who asked for the report gets nothing.
  //
  // So the built file is weighed. If the pictures pushed it past what the
  // server will send, the workbook is built ONCE more without them and says
  // so on its own face. Every figure is identical - only the annexure is
  // gone - and a pack that arrives without its receipts beats a download
  // that fails.
  const file = await assemble(images);
  if (!images || file.byteLength <= RESPONSE_CEILING) return file;
  return assemble(
    undefined,
    `The receipts are NOT in this file. With them it came to ${(file.byteLength / (1024 * 1024)).toFixed(1)} MB, which is more than the server will send in one download. Every figure here is unchanged; open the entries in Petty Cash to see the bills, or run a narrower period to get them in the file.`,
  );
}
