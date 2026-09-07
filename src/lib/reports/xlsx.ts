import ExcelJS from "exceljs";

import { excelFormat, excelWidth, isNumeric, isoToKolkata } from "./format";
import type {
  Panel,
  ReportAnalysis,
  ReportColumn,
  ReportDefinition,
  ReportParams,
  ReportRow,
  Tone,
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
 * ── THERE ARE NO PICTURES IN HERE, AND THAT IS DELIBERATE ────────────────
 *
 * ExcelJS cannot write native Excel charts (`addChart` does not exist), so the
 * two options were embedding chart IMAGES or building the visuals out of
 * cells. Cells won, for three reasons that all matter more than a smoother
 * curve:
 *
 *   · A data bar drawn by Excel's own conditional formatting is LIVE. Filter
 *     the table and it redraws. A PNG is a photograph of one moment and starts
 *     lying the second anybody touches a filter.
 *   · An image needs a rasteriser on the server — a heavy native dependency on
 *     a serverless function, for decoration.
 *   · Cells survive being opened in Google Sheets, LibreOffice, Numbers, and
 *     the Excel app on a phone. Floating images frequently do not.
 *
 * So the trend is a column chart built from filled cells, and every ranked
 * list is a native gradient data bar. Both are colourful, both are real Excel,
 * and both keep working.
 */

// ─── the palette, matching the ERP's own ──────────────────────────────────

const C = {
  ink: "FF16181D",
  ink2: "FF464B56",
  ink3: "FF767D8C",
  rule: "FFDFDFDB",
  paper: "FFF6F6F4",
  card: "FFFFFFFF",
  indigo: "FF2D3F8F",
  indigoDim: "FFE7EAF6",
  teal: "FF0F9B8E",
  tealDim: "FFDFF3F0",
  green: "FF34674F",
  greenDim: "FFE3EFE8",
  red: "FFB23A2C",
  redDim: "FFF8E8E5",
  amber: "FF96660D",
  amberDim: "FFF8EEDB",
} as const;

const TONE: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: C.indigo, bg: C.indigoDim },
  good: { fg: C.green, bg: C.greenDim },
  bad: { fg: C.red, bg: C.redDim },
  warn: { fg: C.amber, bg: C.amberDim },
};

const HEAD = "Aptos Display";
const BODY = "Aptos Narrow";

function fill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function box(ws: ExcelJS.Worksheet, range: string, argb: string) {
  const border: Partial<ExcelJS.Border> = { style: "thin", color: { argb } };
  const [a, b] = range.split(":");
  const start = ws.getCell(a);
  const end = ws.getCell(b);
  for (let r = Number(start.row); r <= Number(end.row); r++) {
    for (let c = Number(start.col); c <= Number(end.col); c++) {
      const cell = ws.getCell(r, c);
      cell.border = {
        top: r === Number(start.row) ? border : undefined,
        bottom: r === Number(end.row) ? border : undefined,
        left: c === Number(start.col) ? border : undefined,
        right: c === Number(end.col) ? border : undefined,
      };
    }
  }
}

// ─── the dashboard ────────────────────────────────────────────────────────

/** Columns A–L give a 12-unit grid; four KPI cards are three units each. */
const GRID = 12;

function buildDashboard(
  wb: ExcelJS.Workbook,
  report: ReportDefinition,
  analysis: ReportAnalysis,
  subtitle: string,
) {
  const ws = wb.addWorksheet("Dashboard", {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  for (let c = 1; c <= GRID; c++) ws.getColumn(c).width = 13.5;
  ws.getColumn(1).width = 2.2; // a left gutter, so nothing touches the edge

  let r = 2;

  // ── title ──────────────────────────────────────────────────────────────
  ws.mergeCells(r, 2, r, GRID);
  const title = ws.getCell(r, 2);
  title.value = report.title;
  title.font = { name: HEAD, size: 20, bold: true, color: { argb: C.ink } };
  ws.getRow(r).height = 28;
  r++;

  ws.mergeCells(r, 2, r, GRID);
  const sub = ws.getCell(r, 2);
  sub.value = subtitle;
  sub.font = { name: BODY, size: 10.5, color: { argb: C.ink3 } };
  ws.getRow(r).height = 16;
  r += 2;

  // ── KPI cards ──────────────────────────────────────────────────────────
  // Up to four across; a fifth wraps to the next band rather than shrinking,
  // because a card too narrow for its figure is worse than a second row.
  const perRow = 4;
  const span = Math.floor((GRID - 1) / perRow); // 2..12 is 11 wide → 2 each
  for (let i = 0; i < analysis.kpis.length; i += perRow) {
    const band = analysis.kpis.slice(i, i + perRow);
    const valueRow = r;
    const labelRow = r + 1;
    ws.getRow(valueRow).height = 30;
    ws.getRow(labelRow).height = 15;
    ws.getRow(labelRow + 1).height = 6;

    band.forEach((kpi, k) => {
      const c1 = 2 + k * span;
      const c2 = c1 + span - 1;
      const tone = TONE[kpi.tone ?? "neutral"];

      ws.mergeCells(valueRow, c1, valueRow, c2);
      const v = ws.getCell(valueRow, c1);
      v.value = kpi.value;
      v.font = { name: HEAD, size: 17, bold: true, color: { argb: tone.fg } };
      v.alignment = { vertical: "middle", indent: 1 };
      for (let c = c1; c <= c2; c++) fill(ws.getCell(valueRow, c), tone.bg);

      ws.mergeCells(labelRow, c1, labelRow, c2);
      const l = ws.getCell(labelRow, c1);
      l.value = kpi.sub ? `${kpi.label.toUpperCase()} · ${kpi.sub}` : kpi.label.toUpperCase();
      l.font = { name: BODY, size: 8, bold: true, color: { argb: C.ink3 } };
      l.alignment = { vertical: "top", indent: 1 };
      for (let c = c1; c <= c2; c++) fill(ws.getCell(labelRow, c), tone.bg);

      box(ws, `${ws.getCell(valueRow, c1).address}:${ws.getCell(labelRow, c2).address}`, C.rule);
    });
    r += 3;
  }
  r += 1;

  // ── the trend, as a column chart made of cells ─────────────────────────
  //
  // Twelve rows tall. Each month is a column of filled cells whose height is
  // its share of the tallest month, so the shape reads at a glance and the
  // exact figure sits under it. Native, printable, and it survives a phone.
  if (analysis.trend && analysis.trend.points.length > 1) {
    ws.mergeCells(r, 2, r, GRID);
    const h = ws.getCell(r, 2);
    h.value = analysis.trend.title.toUpperCase();
    h.font = { name: BODY, size: 8.5, bold: true, color: { argb: C.ink3 } };
    r++;

    const pts = analysis.trend.points.slice(-11); // 11 columns fit B..L
    const peak = Math.max(...pts.map((p) => Math.abs(p.value)), 1);
    const HEIGHT = 8;
    const top = r;

    for (let level = 0; level < HEIGHT; level++) {
      const row = top + level;
      ws.getRow(row).height = 9;
      // level 0 is the top of the chart; a column is filled from its own
      // height downwards.
      const threshold = (HEIGHT - level) / HEIGHT;
      pts.forEach((p, i) => {
        const cell = ws.getCell(row, 2 + i);
        if (Math.abs(p.value) / peak >= threshold) {
          fill(cell, p.value < 0 ? C.redDim : C.indigoDim);
          cell.border = {
            left: { style: "thin", color: { argb: p.value < 0 ? C.red : C.indigo } },
            right: { style: "thin", color: { argb: p.value < 0 ? C.red : C.indigo } },
            top: level === 0 || Math.abs(p.value) / peak < (HEIGHT - level + 1) / HEIGHT
              ? { style: "medium", color: { argb: p.value < 0 ? C.red : C.indigo } }
              : undefined,
          };
        }
      });
    }
    r = top + HEIGHT;

    // the figure, then the month, under each column
    ws.getRow(r).height = 14;
    pts.forEach((p, i) => {
      const c = ws.getCell(r, 2 + i);
      c.value = p.display;
      c.font = { name: BODY, size: 8.5, bold: true, color: { argb: C.ink } };
      c.alignment = { horizontal: "center" };
      c.border = { top: { style: "thin", color: { argb: C.rule } } };
    });
    r++;
    ws.getRow(r).height = 13;
    pts.forEach((p, i) => {
      const c = ws.getCell(r, 2 + i);
      c.value = p.label;
      c.font = { name: BODY, size: 8, color: { argb: C.ink3 } };
      c.alignment = { horizontal: "center" };
    });
    r += 2;
  }

  // ── ranked panels, two across, with live data bars ─────────────────────
  const panels = analysis.panels.slice(0, 4);
  for (let i = 0; i < panels.length; i += 2) {
    const pair = panels.slice(i, i + 2);
    const startRow = r;
    let deepest = r;

    pair.forEach((panel, k) => {
      const c1 = 2 + k * 6; // B..G and H..M-ish; six columns each
      const c2 = c1 + 4;
      let pr = startRow;

      ws.mergeCells(pr, c1, pr, c2);
      const h = ws.getCell(pr, c1);
      h.value = panel.title.toUpperCase();
      h.font = { name: BODY, size: 8.5, bold: true, color: { argb: C.ink3 } };
      pr++;

      const firstDataRow = pr;
      panel.rows.slice(0, 8).forEach((row) => {
        ws.getRow(pr).height = 15;
        ws.mergeCells(pr, c1, pr, c1 + 1);
        const label = ws.getCell(pr, c1);
        label.value = row.label;
        label.font = { name: BODY, size: 9.5, color: { argb: C.ink } };
        label.alignment = { vertical: "middle" };

        // The bar cell holds the raw number; the data bar draws it and the
        // number itself is hidden behind a format that renders nothing.
        const bar = ws.getCell(pr, c1 + 2);
        bar.value = row.value;
        bar.numFmt = ';;;'; // show the bar, not the digits

        ws.mergeCells(pr, c1 + 3, pr, c2);
        const val = ws.getCell(pr, c1 + 3);
        val.value = row.share !== undefined
          ? `${row.display}   ${row.share.toFixed(1)}%`
          : row.display;
        val.font = { name: BODY, size: 9.5, bold: true, color: { argb: C.ink } };
        val.alignment = { horizontal: "right", vertical: "middle" };

        pr++;
      });

      if (pr > firstDataRow) {
        const col = ws.getColumn(c1 + 2).letter;
        ws.addConditionalFormatting({
          ref: `${col}${firstDataRow}:${col}${pr - 1}`,
          rules: [
            // ExcelJS ships no exported type for a data-bar rule even though
            // it writes one, so the shape is asserted rather than named.
            {
              type: "dataBar",
              priority: 1,
              gradient: true,
              minLength: 0,
              maxLength: 100,
              color: { argb: C.teal },
              // `cfvo` is REQUIRED and undocumented as such. Without it the
              // workbook builds without complaint and then dies inside
              // `writeBuffer()` on `rule.cfvo.forEach` — a failure a long way
              // from its cause, which is why it is spelled out here.
              cfvo: [{ type: "min" }, { type: "max" }],
            } as unknown as ExcelJS.ConditionalFormattingRule,
          ],
        });
      }
      deepest = Math.max(deepest, pr);
    });

    r = deepest + 2;
  }

  // ── the sentences ──────────────────────────────────────────────────────
  if (analysis.insights.length) {
    ws.mergeCells(r, 2, r, GRID);
    const h = ws.getCell(r, 2);
    h.value = "WHAT THIS SAYS";
    h.font = { name: BODY, size: 8.5, bold: true, color: { argb: C.ink3 } };
    r++;

    for (const line of analysis.insights) {
      ws.mergeCells(r, 2, r, GRID);
      const c = ws.getCell(r, 2);
      c.value = `•   ${line}`;
      c.font = { name: BODY, size: 10.5, color: { argb: C.ink2 } };
      c.alignment = { wrapText: true, vertical: "middle", indent: 1 };
      ws.getRow(r).height = Math.max(18, Math.ceil(line.length / 105) * 15);
      fill(c, C.paper);
      r++;
    }
    r += 1;
  }

  if (analysis.caveats.length) {
    ws.mergeCells(r, 2, r, GRID);
    const h = ws.getCell(r, 2);
    h.value = "READ THIS BEFORE QUOTING THESE FIGURES";
    h.font = { name: BODY, size: 8.5, bold: true, color: { argb: C.amber } };
    r++;
    for (const line of analysis.caveats) {
      ws.mergeCells(r, 2, r, GRID);
      const c = ws.getCell(r, 2);
      c.value = `!   ${line}`;
      c.font = { name: BODY, size: 10, color: { argb: C.ink2 } };
      c.alignment = { wrapText: true, vertical: "middle", indent: 1 };
      ws.getRow(r).height = Math.max(18, Math.ceil(line.length / 105) * 15);
      fill(c, C.amberDim);
      r++;
    }
  }
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

  // A totals row for the money and quantity columns, formula-driven so it
  // stays right if somebody deletes rows.
  if (rows.length) {
    const totalRow = ws.addRow({});
    totalRow.height = 20;
    columns.forEach((c, i) => {
      const cell = totalRow.getCell(i + 1);
      cell.font = { name: BODY, size: 9.5, bold: true, color: { argb: C.ink } };
      cell.border = { top: { style: "medium", color: { argb: C.indigo } } };
      if (i === 0) cell.value = "Total";
      else if (c.type === "money" || c.type === "number" || c.type === "int") {
        const col = ws.getColumn(i + 1).letter;
        cell.value = { formula: `SUBTOTAL(109,${col}2:${col}${rows.length + 1})` };
        cell.numFmt = excelFormat(c.type) ?? "#,##0.00";
      }
    });
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

  buildDashboard(wb, report, analysis, subtitle);
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

/** Re-exported so callers need only this module for an export. */
export type { Panel };
