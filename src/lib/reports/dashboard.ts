import ExcelJS from "exceljs";

import type { Kpi, Matrix, Panel, ReportAnalysis } from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The dashboard sheet
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Split out of the workbook builder because it grew into the part that decides
 * whether anybody reads the file.
 *
 * ── SIX VISUALS, NOT ONE REPEATED SIX TIMES ──────────────────────────────
 *
 * The first version drew the same teal ranked bar for every panel on every
 * report, which is how a dashboard ends up looking busy and saying nothing.
 * Each shape here answers a different kind of question:
 *
 *   KPI band      how much, and which way is it moving
 *   column chart  when — the shape over time, with the average marked
 *   share bar     composition — is this a few names or many
 *   ranked bars   who is biggest
 *   funnel        where a sequence loses its people, with the drop labelled
 *   split bars    who moved a number, up and down from a centre line
 *   heat grid     when AND who at once — the only one that shows both
 *
 * ── STILL NO IMAGES, AND STILL FOR THE SAME REASONS ──────────────────────
 *
 * Every one is Excel's own cells and conditional formatting: live under a
 * filter, printable, and opens correctly in Google Sheets, LibreOffice and the
 * Excel app on a phone. A PNG is a photograph that starts lying the moment
 * somebody filters the table.
 *
 * ── THE WORDS ARE FOR THE PERSON, NOT THE ANALYST ────────────────────────
 *
 * "Where the money came from", not "Revenue distribution by counterparty".
 * The one sentence somebody would repeat in a meeting is printed at the top,
 * larger than anything else, before a single number.
 */

// ─── palette ──────────────────────────────────────────────────────────────
//
// Rotated per panel so four panels on one screen are four colours rather than
// four of the same. Chosen to stay distinguishable when printed in grey.

export const C = {
  ink: "FF16181D",
  ink2: "FF464B56",
  ink3: "FF7A8291",
  rule: "FFDDDFE3",
  paper: "FFF7F8FA",
  white: "FFFFFFFF",

  indigo: "FF2D3F8F", indigoDim: "FFE7EAF6",
  teal: "FF0F8F86",   tealDim: "FFDDF1EF",
  violet: "FF6D4AA6", violetDim: "FFEDE7F6",
  amber: "FF9A6B12",  amberDim: "FFFAF0DC",
  rose: "FFB23A5B",   roseDim: "FFFBE7EC",
  green: "FF2F7A52",  greenDim: "FFE2F1E8",
  red: "FFB23A2C",    redDim: "FFF9E8E5",
  slate: "FF4A5568",  slateDim: "FFEDEFF2",
} as const;

/** One colour per panel, in order. */
const SERIES = [
  { solid: C.indigo, dim: C.indigoDim },
  { solid: C.teal, dim: C.tealDim },
  { solid: C.violet, dim: C.violetDim },
  { solid: C.amber, dim: C.amberDim },
  { solid: C.rose, dim: C.roseDim },
  { solid: C.slate, dim: C.slateDim },
] as const;

const TONE: Record<string, { fg: string; bg: string }> = {
  neutral: { fg: C.indigo, bg: C.indigoDim },
  good: { fg: C.green, bg: C.greenDim },
  bad: { fg: C.red, bg: C.redDim },
  warn: { fg: C.amber, bg: C.amberDim },
};

const HEAD = "Aptos Display";
const BODY = "Aptos Narrow";
const GRID = 12; // columns B..M

function fill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function outline(ws: ExcelJS.Worksheet, r1: number, c1: number, r2: number, c2: number, argb: string) {
  const b: Partial<ExcelJS.Border> = { style: "thin", color: { argb } };
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      ws.getCell(r, c).border = {
        top: r === r1 ? b : undefined,
        bottom: r === r2 ? b : undefined,
        left: c === c1 ? b : undefined,
        right: c === c2 ? b : undefined,
      };
    }
  }
}

/** A small uppercase caption above a block. */
function caption(
  ws: ExcelJS.Worksheet,
  row: number,
  c1: number,
  c2: number,
  text: string,
  argb: string = C.ink3,
) {
  ws.mergeCells(row, c1, row, c2);
  const cell = ws.getCell(row, c1);
  cell.value = text.toUpperCase();
  cell.font = { name: BODY, size: 8.5, bold: true, color: { argb } };
  ws.getRow(row).height = 14;
}

// ─── the sheet ────────────────────────────────────────────────────────────

export function buildDashboard(
  wb: ExcelJS.Workbook,
  title: string,
  subtitle: string,
  a: ReportAnalysis,
) {
  const ws = wb.addWorksheet("Dashboard", {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  for (let c = 1; c <= GRID + 1; c++) ws.getColumn(c).width = 12.6;
  ws.getColumn(1).width = 2;

  let r = 2;

  // ── masthead ───────────────────────────────────────────────────────────
  ws.mergeCells(r, 2, r, GRID + 1);
  const t = ws.getCell(r, 2);
  t.value = title;
  t.font = { name: HEAD, size: 22, bold: true, color: { argb: C.ink } };
  ws.getRow(r).height = 30;
  r++;

  ws.mergeCells(r, 2, r, GRID + 1);
  const st = ws.getCell(r, 2);
  st.value = subtitle;
  st.font = { name: BODY, size: 10, color: { argb: C.ink3 } };
  ws.getRow(r).height = 15;
  r += 2;

  // ── the one sentence ───────────────────────────────────────────────────
  if (a.headline) {
    ws.mergeCells(r, 2, r + 1, GRID + 1);
    const h = ws.getCell(r, 2);
    h.value = a.headline;
    h.font = { name: HEAD, size: 12.5, bold: true, color: { argb: C.indigo } };
    h.alignment = { wrapText: true, vertical: "middle", indent: 1 };
    for (let rr = r; rr <= r + 1; rr++) for (let c = 2; c <= GRID + 1; c++) fill(ws.getCell(rr, c), C.indigoDim);
    ws.getRow(r).height = 19;
    ws.getRow(r + 1).height = 19;
    outline(ws, r, 2, r + 1, GRID + 1, C.indigo);
    r += 3;
  }

  // ── KPI band ───────────────────────────────────────────────────────────
  r = drawKpis(ws, r, a.kpis);
  r += 1;

  // ── the trend ──────────────────────────────────────────────────────────
  if (a.trend && a.trend.points.length > 1) r = drawTrend(ws, r, a.trend);

  // ── panels, two across ─────────────────────────────────────────────────
  const panels = a.panels.slice(0, 6);
  for (let i = 0; i < panels.length; i += 2) {
    const pair = panels.slice(i, i + 2);
    let deepest = r;
    pair.forEach((panel, k) => {
      const c1 = 2 + k * 6;
      const end = drawPanel(ws, r, c1, c1 + 5, panel, SERIES[(i + k) % SERIES.length]);
      deepest = Math.max(deepest, end);
    });
    r = deepest + 1;
  }

  // ── the heat grid ──────────────────────────────────────────────────────
  if (a.matrix && a.matrix.rows.length) r = drawMatrix(ws, r, a.matrix);

  // ── the sentences ──────────────────────────────────────────────────────
  if (a.insights.length) {
    caption(ws, r, 2, GRID + 1, "What this says");
    r++;
    for (const line of a.insights) {
      ws.mergeCells(r, 2, r, GRID + 1);
      const c = ws.getCell(r, 2);
      c.value = line;
      c.font = { name: BODY, size: 10.5, color: { argb: C.ink2 } };
      c.alignment = { wrapText: true, vertical: "middle", indent: 2 };
      ws.getRow(r).height = Math.max(17, Math.ceil(line.length / 118) * 14 + 4);
      fill(c, C.paper);
      for (let cc = 2; cc <= GRID + 1; cc++) fill(ws.getCell(r, cc), C.paper);
      ws.getCell(r, 2).border = { left: { style: "medium", color: { argb: C.teal } } };
      r++;
    }
    r += 1;
  }

  if (a.caveats.length) {
    caption(ws, r, 2, GRID + 1, "Worth knowing before you quote these figures", C.amber);
    r++;
    for (const line of a.caveats) {
      ws.mergeCells(r, 2, r, GRID + 1);
      const c = ws.getCell(r, 2);
      c.value = line;
      c.font = { name: BODY, size: 9.5, color: { argb: C.ink2 } };
      c.alignment = { wrapText: true, vertical: "middle", indent: 2 };
      ws.getRow(r).height = Math.max(16, Math.ceil(line.length / 128) * 13 + 3);
      for (let cc = 2; cc <= GRID + 1; cc++) fill(ws.getCell(r, cc), C.amberDim);
      ws.getCell(r, 2).border = { left: { style: "medium", color: { argb: C.amber } } };
      r++;
    }
  }
}

// ─── KPI cards ────────────────────────────────────────────────────────────

function drawKpis(ws: ExcelJS.Worksheet, top: number, kpis: Kpi[]): number {
  const perRow = 4;
  const span = 3; // 4 cards × 3 columns = B..M
  let r = top;

  for (let i = 0; i < kpis.length; i += perRow) {
    const band = kpis.slice(i, i + perRow);
    ws.getRow(r).height = 13;      // label
    ws.getRow(r + 1).height = 26;  // figure
    ws.getRow(r + 2).height = 13;  // sub / movement
    ws.getRow(r + 3).height = 5;   // gutter

    band.forEach((k, j) => {
      const c1 = 2 + j * span;
      const c2 = c1 + span - 1;
      const tone = TONE[k.tone ?? "neutral"];

      for (let rr = r; rr <= r + 2; rr++) for (let c = c1; c <= c2; c++) fill(ws.getCell(rr, c), tone.bg);

      ws.mergeCells(r, c1, r, c2);
      const lab = ws.getCell(r, c1);
      lab.value = k.label.toUpperCase();
      lab.font = { name: BODY, size: 8, bold: true, color: { argb: C.ink3 } };
      lab.alignment = { vertical: "middle", indent: 1 };

      ws.mergeCells(r + 1, c1, r + 1, c2);
      const val = ws.getCell(r + 1, c1);
      val.value = k.value;
      val.font = { name: HEAD, size: 18, bold: true, color: { argb: tone.fg } };
      val.alignment = { vertical: "middle", indent: 1 };

      // The movement, with an arrow that follows the VALUE and a colour that
      // follows whether that is good news — they are different questions, and
      // a falling cancellation rate is a green down-arrow.
      const bits: string[] = [];
      if (k.deltaPct !== null && k.deltaPct !== undefined && Number.isFinite(k.deltaPct)) {
        const up = k.deltaPct >= 0;
        bits.push(`${up ? "▲" : "▼"} ${Math.abs(k.deltaPct).toFixed(1)}%`);
      }
      if (k.sub) bits.push(k.sub);

      ws.mergeCells(r + 2, c1, r + 2, c2);
      const sub = ws.getCell(r + 2, c1);
      sub.value = bits.join("   ");
      const goodMove =
        k.deltaPct === null || k.deltaPct === undefined
          ? null
          : k.lowerIsBetter
            ? k.deltaPct <= 0
            : k.deltaPct >= 0;
      sub.font = {
        name: BODY,
        size: 8.5,
        bold: goodMove !== null,
        color: { argb: goodMove === null ? C.ink3 : goodMove ? C.green : C.red },
      };
      sub.alignment = { vertical: "top", indent: 1 };

      outline(ws, r, c1, r + 2, c2, C.rule);
    });
    r += 4;
  }
  return r;
}

// ─── the column chart ─────────────────────────────────────────────────────

function drawTrend(
  ws: ExcelJS.Worksheet,
  top: number,
  trend: NonNullable<ReportAnalysis["trend"]>,
): number {
  let r = top;
  caption(ws, r, 2, GRID + 1, trend.title);
  r++;

  const pts = trend.points.slice(-12);
  const cmp = trend.compare?.points.slice(-12);
  const peak = Math.max(...pts.map((p) => Math.abs(p.value)), ...(cmp ?? []).map((p) => Math.abs(p.value)), 1);
  const avg = pts.reduce((s, p) => s + p.value, 0) / Math.max(1, pts.length);
  const HEIGHT = 9;
  const chartTop = r;

  // Two columns per month when there is a comparison series, one otherwise.
  const perPoint = cmp ? 1 : 1;
  const width = Math.min(pts.length * perPoint, GRID);

  for (let level = 0; level < HEIGHT; level++) {
    const row = chartTop + level;
    ws.getRow(row).height = 9;
    const hi = (HEIGHT - level) / HEIGHT;
    const lo = (HEIGHT - level - 1) / HEIGHT;

    pts.forEach((p, i) => {
      if (i >= width) return;
      const cell = ws.getCell(row, 2 + i);
      const frac = Math.abs(p.value) / peak;
      const cmpFrac = cmp?.[i] ? Math.abs(cmp[i].value) / peak : 0;

      if (frac >= hi) {
        // Solid body of the column.
        fill(cell, p.value < 0 ? C.redDim : C.indigoDim);
        cell.border = {
          left: { style: "thin", color: { argb: p.value < 0 ? C.red : C.indigo } },
          right: { style: "thin", color: { argb: p.value < 0 ? C.red : C.indigo } },
          top: frac < (HEIGHT - level + 1) / HEIGHT ? { style: "medium", color: { argb: p.value < 0 ? C.red : C.indigo } } : undefined,
        };
      } else if (cmpFrac >= hi) {
        // The comparison series shows only where the main one does not reach.
        fill(cell, C.slateDim);
      }

      // The average, drawn as a rule across whichever band contains it.
      const avgFrac = Math.abs(avg) / peak;
      if (avgFrac > lo && avgFrac <= hi) {
        const c = ws.getCell(row, 2 + i);
        c.border = { ...(c.border ?? {}), bottom: { style: "dashed", color: { argb: C.amber } } };
      }
    });
  }
  r = chartTop + HEIGHT;

  // figures, then labels
  ws.getRow(r).height = 14;
  pts.forEach((p, i) => {
    if (i >= width) return;
    const c = ws.getCell(r, 2 + i);
    c.value = p.display;
    c.font = { name: BODY, size: 8.5, bold: true, color: { argb: C.ink } };
    c.alignment = { horizontal: "center" };
    c.border = { top: { style: "thin", color: { argb: C.ink3 } } };
  });
  r++;
  ws.getRow(r).height = 13;
  pts.forEach((p, i) => {
    if (i >= width) return;
    const c = ws.getCell(r, 2 + i);
    c.value = p.label;
    c.font = { name: BODY, size: 8, color: { argb: C.ink3 } };
    c.alignment = { horizontal: "center" };
  });
  r++;

  const legend: string[] = [`▬ ${trend.valueLabel}`];
  if (trend.compare) legend.push(`▬ ${trend.compare.label}`);
  legend.push(`- - - ${trend.averageLabel ?? "Average for the period"}`);
  ws.mergeCells(r, 2, r, GRID + 1);
  const lg = ws.getCell(r, 2);
  lg.value = legend.join("      ");
  lg.font = { name: BODY, size: 8, color: { argb: C.ink3 } };
  ws.getRow(r).height = 13;
  return r + 2;
}

// ─── panels ───────────────────────────────────────────────────────────────

function drawPanel(
  ws: ExcelJS.Worksheet,
  top: number,
  c1: number,
  c2: number,
  panel: Panel,
  series: { solid: string; dim: string },
): number {
  let r = top;
  caption(ws, r, c1, c2, panel.title);
  r++;

  if (!panel.rows.length) {
    ws.mergeCells(r, c1, r, c2);
    const c = ws.getCell(r, c1);
    c.value = "Nothing to show for this period.";
    c.font = { name: BODY, size: 9.5, italic: true, color: { argb: C.ink3 } };
    return r + 2;
  }

  if (panel.kind === "share") return drawShare(ws, r, c1, c2, panel);

  const rows = panel.rows.slice(0, 8);
  const first = r;
  const max = Math.max(...rows.map((x) => Math.abs(x.value)), 1);

  rows.forEach((row, i) => {
    ws.getRow(r).height = 15;

    ws.mergeCells(r, c1, r, c1 + 1);
    const label = ws.getCell(r, c1);
    // A funnel indents each step, so the sequence reads as a descent.
    label.value = panel.kind === "funnel" ? `${"  ".repeat(Math.min(i, 4))}${row.label}` : row.label;
    label.font = { name: BODY, size: 9.5, color: { argb: C.ink } };
    label.alignment = { vertical: "middle" };

    const bar = ws.getCell(r, c1 + 2);
    bar.value = Math.abs(row.value);
    bar.numFmt = ";;;"; // the bar is the point; the digits sit to its right

    ws.mergeCells(r, c1 + 3, r, c2);
    const val = ws.getCell(r, c1 + 3);
    const parts: string[] = [row.display];
    if (row.share !== undefined) parts.push(`${row.share.toFixed(1)}%`);
    if (row.meta) parts.push(row.meta);
    val.value = parts.join("   ");
    val.font = {
      name: BODY,
      size: 9.5,
      bold: true,
      color: { argb: panel.kind === "split" ? (row.value < 0 ? C.red : C.green) : C.ink },
    };
    val.alignment = { horizontal: "right", vertical: "middle" };
    r++;
  });

  // A diverging panel gets red and green rules so a fall reads as a fall.
  const col = ws.getColumn(c1 + 2).letter;
  if (panel.kind === "split") {
    const neg = rows.map((x, i) => ({ x, i })).filter(({ x }) => x.value < 0);
    const pos = rows.map((x, i) => ({ x, i })).filter(({ x }) => x.value >= 0);
    for (const [set, colour] of [[neg, C.red] as const, [pos, C.green] as const]) {
      for (const { i } of set) {
        ws.addConditionalFormatting({
          ref: `${col}${first + i}:${col}${first + i}`,
          rules: [dataBar(colour, max)],
        });
      }
    }
  } else {
    ws.addConditionalFormatting({
      ref: `${col}${first}:${col}${r - 1}`,
      rules: [dataBar(series.solid, max)],
    });
  }

  if (panel.note) {
    ws.mergeCells(r, c1, r, c2);
    const nc = ws.getCell(r, c1);
    nc.value = panel.note;
    nc.font = { name: BODY, size: 8, italic: true, color: { argb: C.ink3 } };
    nc.alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r).height = Math.max(13, Math.ceil(panel.note.length / 58) * 11);
    r++;
  }
  return r + 1;
}

/** A fixed maximum, so two panels side by side are on the same scale. */
function dataBar(argb: string, max: number): ExcelJS.ConditionalFormattingRule {
  return {
    type: "dataBar",
    priority: 1,
    gradient: true,
    minLength: 0,
    maxLength: 100,
    color: { argb },
    // `cfvo` is REQUIRED and undocumented as such — without it the workbook
    // builds and then dies inside writeBuffer() on `rule.cfvo.forEach`.
    cfvo: [
      { type: "num", value: 0 },
      { type: "num", value: max },
    ],
  } as unknown as ExcelJS.ConditionalFormattingRule;
}

/**
 * Composition, as one 100%-wide bar split into coloured segments.
 *
 * The question is not "who is biggest" — the ranked panel answers that — it is
 * "is this a handful of names or a long tail", which a list of numbers makes
 * you work out and a single bar shows instantly.
 */
function drawShare(ws: ExcelJS.Worksheet, top: number, c1: number, c2: number, panel: Panel): number {
  let r = top;
  const width = c2 - c1 + 1;
  const rows = panel.rows.slice(0, 5);
  const shown = rows.reduce((s, x) => s + x.value, 0);
  const total = panel.rows.reduce((s, x) => s + x.value, 0);
  const rest = Math.max(0, total - shown);
  const segments = [
    ...rows.map((x, i) => ({ label: x.label, value: x.value, colour: SERIES[i % SERIES.length].solid, display: x.display })),
    ...(rest > 0 ? [{ label: "Everyone else", value: rest, colour: C.rule, display: "" }] : []),
  ];

  // The bar itself: one row of cells, each coloured by whichever segment it
  // falls into. Twelve cells is coarse, so a segment under ~8% still gets one
  // cell rather than vanishing — which is the honest failure.
  ws.getRow(r).height = 20;
  let acc = 0;
  const cuts = segments.map((s) => {
    acc += s.value;
    return total > 0 ? acc / total : 0;
  });
  for (let i = 0; i < width; i++) {
    const at = (i + 0.5) / width;
    const idx = Math.max(0, cuts.findIndex((c) => at <= c));
    fill(ws.getCell(r, c1 + i), segments[idx]?.colour ?? C.rule);
  }
  outline(ws, r, c1, r, c2, C.rule);
  r++;

  // Legend, two per line.
  for (let i = 0; i < segments.length; i += 2) {
    ws.getRow(r).height = 13;
    segments.slice(i, i + 2).forEach((s, k) => {
      const cc = c1 + k * 3;
      const dot = ws.getCell(r, cc);
      dot.value = "■";
      dot.font = { name: BODY, size: 10, color: { argb: s.colour } };
      dot.alignment = { horizontal: "right" };
      ws.mergeCells(r, cc + 1, r, cc + 2);
      const lab = ws.getCell(r, cc + 1);
      const share = total > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0";
      lab.value = `${s.label}  ${share}%`;
      lab.font = { name: BODY, size: 8.5, color: { argb: C.ink2 } };
    });
    r++;
  }

  if (panel.note) {
    ws.mergeCells(r, c1, r, c2);
    const nc = ws.getCell(r, c1);
    nc.value = panel.note;
    nc.font = { name: BODY, size: 8, italic: true, color: { argb: C.ink3 } };
    ws.getRow(r).height = 13;
    r++;
  }
  return r + 1;
}

// ─── the heat grid ────────────────────────────────────────────────────────

function drawMatrix(ws: ExcelJS.Worksheet, top: number, m: Matrix): number {
  let r = top;
  caption(ws, r, 2, GRID + 1, m.title);
  r++;

  const labelCols = 3;
  const first = 2 + labelCols;
  const cols = m.columns.slice(0, GRID - labelCols);

  // header
  ws.getRow(r).height = 14;
  cols.forEach((c, i) => {
    const cell = ws.getCell(r, first + i);
    cell.value = c;
    cell.font = { name: BODY, size: 8, bold: true, color: { argb: C.ink3 } };
    cell.alignment = { horizontal: "center" };
  });
  const totalCol = first + cols.length;
  const th = ws.getCell(r, totalCol);
  th.value = "Total";
  th.font = { name: BODY, size: 8, bold: true, color: { argb: C.ink3 } };
  th.alignment = { horizontal: "right" };
  r++;

  const firstDataRow = r;
  for (const row of m.rows.slice(0, 10)) {
    ws.getRow(r).height = 15;
    ws.mergeCells(r, 2, r, 2 + labelCols - 1);
    const lab = ws.getCell(r, 2);
    lab.value = row.label;
    lab.font = { name: BODY, size: 9, color: { argb: C.ink } };
    lab.alignment = { vertical: "middle" };

    cols.forEach((_, i) => {
      const cell = ws.getCell(r, first + i);
      cell.value = row.values[i] ?? 0;
      cell.numFmt = m.format === "money" ? "#,##0,;;—" : "#,##0;;—";
      cell.font = { name: BODY, size: 8.5, color: { argb: C.ink2 } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    const tot = ws.getCell(r, totalCol);
    tot.value = row.totalDisplay;
    tot.font = { name: BODY, size: 9, bold: true, color: { argb: C.ink } };
    tot.alignment = { horizontal: "right", vertical: "middle" };
    r++;
  }

  // Excel's own three-colour scale over the grid — pale where little happened,
  // deep where a lot did, and it redraws if the numbers change.
  if (r > firstDataRow) {
    const a = ws.getColumn(first).letter;
    const b = ws.getColumn(first + cols.length - 1).letter;
    ws.addConditionalFormatting({
      ref: `${a}${firstDataRow}:${b}${r - 1}`,
      rules: [
        {
          type: "colorScale",
          priority: 1,
          cfvo: [{ type: "min" }, { type: "percentile", value: 60 }, { type: "max" }],
          color: [{ argb: C.white }, { argb: C.tealDim }, { argb: C.teal }],
        } as unknown as ExcelJS.ConditionalFormattingRule,
      ],
    });
  }

  ws.mergeCells(r, 2, r, GRID + 1);
  const note = ws.getCell(r, 2);
  note.value =
    (m.note ? m.note + "  " : "") +
    (m.format === "money" ? "Figures in thousands of rupees. " : "") +
    "Darker means more. A dash means nothing that month.";
  note.font = { name: BODY, size: 8, italic: true, color: { argb: C.ink3 } };
  ws.getRow(r).height = 13;
  return r + 2;
}
