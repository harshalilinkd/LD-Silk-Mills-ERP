import ExcelJS from "exceljs";

import { C, buildDashboard } from "./dashboard";

import { excelFormat, excelWidth, isNumeric, isoToKolkata } from "./format";
import type {
  ReportAnalysis,
  ReportColumn,
  ReportDefinition,
  ReportParams,
  ReportRow,
} from "./types";

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
      numFmt: excelFormat(c.type),
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
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

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
        out[c.key] = isoToKolkata(String(v));
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

  // Banding, so the eye keeps its place across thirty columns.
  for (let i = 2; i <= rows.length + 1; i += 2) {
    ws.getRow(i).eachCell({ includeEmpty: true }, (cell) => fill(cell, C.paper));
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
      cell.numFmt = excelFormat(c.type) ?? "#,##0.00";
    });

    // Said out loud, because a blank cell under a column of numbers otherwise
    // looks like something failed to calculate.
    const noteRow = ws.addRow({});
    const note = noteRow.getCell(1);
    note.value =
      "Blank cells above are columns that cannot be added up — percentages, averages already worked out, ages, and counts of distinct things. " +
      "Totals follow the filter buttons.";
    note.font = { name: BODY, size: 8.5, italic: true, color: { argb: C.ink3 } };
    ws.mergeCells(noteRow.number, 1, noteRow.number, Math.min(columns.length, 12));
  }
}

// ─── the notes sheet ──────────────────────────────────────────────────────

function buildNotes(
  wb: ExcelJS.Workbook,
  report: ReportDefinition,
  params: ReportParams,
  analysis: ReportAnalysis,
  meta: { runBy: string; runAt: Date; rowsShown: number; totalRows: number },
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
  line(
    "Period",
    params.from && params.to ? `${params.from} to ${params.to}` : "Everything on record",
  );
  for (const f of report.filters) {
    if (f.kind === "dateRange") continue;
    const v = params[f.key];
    if (v) line(f.label, v);
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
    line(c.label, c.note ?? TYPE_NOTE[c.type] ?? "");
  }
}

const TYPE_NOTE: Record<ReportColumn["type"], string> = {
  text: "Text.",
  int: "A whole count.",
  number: "A measured quantity.",
  money: "Rupees. Adds up down the column.",
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
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LD Silk Mills ERP";
  wb.created = meta.runAt;
  wb.title = report.title;

  const period =
    params.from && params.to ? `${params.from} to ${params.to}` : "everything on record";
  const subtitle =
    `${period}  ·  ${rows.length.toLocaleString("en-IN")} rows` +
    (rows.length < meta.totalRows ? ` of ${meta.totalRows.toLocaleString("en-IN")} (truncated)` : "") +
    `  ·  run ${isoToKolkata(meta.runAt.toISOString())}`;

  buildDashboard(wb, report.title, subtitle, analysis);
  buildData(wb, columns, rows);
  buildNotes(wb, report, params, analysis, {
    runBy: meta.runBy,
    runAt: meta.runAt,
    rowsShown: rows.length,
    totalRows: meta.totalRows,
  });

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
