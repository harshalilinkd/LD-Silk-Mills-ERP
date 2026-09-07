import ExcelJS from "exceljs";

import type { Kpi, Matrix, Panel, ReportAnalysis } from "./types";
import type { ChartSpec } from "./xlsx-charts";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The dashboard sheet
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── IT DRAWS REAL EXCEL CHARTS NOW ───────────────────────────────────────
 *
 * Every visual here used to be built out of cells and conditional formatting,
 * because ExcelJS has no `addChart`. It was honest and it printed, but it did
 * not look like a dashboard, and the owner asked for the exported sheet to
 * carry what the screen carries.
 *
 * So this file lays the sheet out and DESCRIBES the charts; `xlsx-charts.ts`
 * writes them into the finished workbook as native chart parts. They are real
 * Excel charts: right-click → Edit Data works, they redraw when the numbers
 * change, and they open in Google Sheets and LibreOffice. That is the thing an
 * embedded PNG could never be, and the reason images were refused.
 *
 * Two things stay as cells on purpose:
 *
 *   · **The KPI band.** Tiles, not a chart — the reference dashboards the
 *     owner shared use tiles too, and a figure with its own movement arrow and
 *     denominator reads better as a card than as a bar of length one.
 *   · **The heat grid.** No chart type shows WHO and WHEN at once. Excel's own
 *     three-colour scale over a grid does, and it stays live.
 *
 * ── WHERE THE CHARTS GET THEIR NUMBERS ───────────────────────────────────
 *
 * A hidden sheet, "Chart data". A native chart must point at cells to be
 * editable, and pointing it at the Data sheet would mean a chart that changes
 * shape when somebody filters the table — which sounds clever and is not: the
 * KPIs and the headline describe the whole period, so half the sheet would
 * then be answering a different question from the other half. The dashboard
 * describes the period as a whole, always, and says so.
 *
 * ── MONEY IS PLOTTED IN LAKHS ────────────────────────────────────────────
 *
 * An axis reading 20,000,000 is unreadable and Excel's own scaling only does
 * powers of a thousand, so it cannot produce lakh or crore. Money series are
 * therefore divided by 100,000 and the chart title says "(₹ lakh)". The exact
 * rupee figures are on the Data sheet, to the paisa.
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

/** One colour per chart, in order. */
const SERIES = [C.indigo, C.teal, C.violet, C.amber, C.rose, C.slate] as const;

/** For pies and doughnuts, where every slice needs its own. */
const WHEEL = [
  C.indigo, C.teal, C.amber, C.violet, C.green, C.rose, C.slate, C.red,
  "FF7C93D8", "FF63C3BB", "FFD3A24A", "FFA98BD1",
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

/** How many sheet rows one chart occupies. 22 × 15px ≈ 330px tall. */
const CHART_ROWS = 22;
/** How many columns. Two charts across the twelve-column grid. */
const CHART_COLS = 6;

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

// ─── the hidden sheet the charts point at ─────────────────────────────────

const CHART_SHEET = "Chart data";

/** `1 → A`, `27 → AA`. Needed to build the absolute references by hand. */
function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Writes one block of chart source data and hands back the absolute references
 * to it. Blocks run left to right with a blank column between them, so a
 * person who unhides the sheet sees each chart's numbers in its own little
 * table under its own heading.
 */
type Block = { catRef: string; valRefs: string[] };

function writeBlock(
  ws: ExcelJS.Worksheet,
  col: number,
  title: string,
  categories: string[],
  series: { name: string; values: number[] }[],
): Block {
  const q = `'${CHART_SHEET}'!`;
  ws.getCell(1, col).value = title;
  ws.getCell(1, col).font = { name: BODY, size: 9, bold: true, color: { argb: C.ink } };

  ws.getCell(2, col).value = "Label";
  series.forEach((s, i) => {
    ws.getCell(2, col + 1 + i).value = s.name;
  });
  for (let c = col; c <= col + series.length; c++) {
    ws.getCell(2, c).font = { name: BODY, size: 8.5, bold: true, color: { argb: C.ink3 } };
  }

  categories.forEach((label, i) => {
    ws.getCell(3 + i, col).value = label;
    series.forEach((s, j) => {
      ws.getCell(3 + i, col + 1 + j).value = s.values[i] ?? 0;
    });
  });

  const first = 3;
  const last = 3 + categories.length - 1;
  const L = colLetter(col);
  return {
    catRef: `${q}$${L}$${first}:$${L}$${last}`,
    valRefs: series.map((_, j) => {
      const V = colLetter(col + 1 + j);
      return `${q}$${V}$${first}:$${V}$${last}`;
    }),
  };
}

// ─── money, in a unit a person can read ───────────────────────────────────

/**
 * Panels do not say whether they carry money — their `display` strings do, and
 * they are the same strings the workbook prints elsewhere. So the ₹ sign is
 * what decides, which is exactly the fact being relied on.
 */
function isMoneyPanel(p: Panel): boolean {
  return p.rows.some((r) => r.display.includes("₹"));
}

function scale(values: number[], money: boolean): { values: number[]; fmt: string; suffix: string } {
  if (!money) return { values, fmt: "#,##0", suffix: "" };
  const peak = Math.max(0, ...values.map((v) => Math.abs(v)));
  if (peak >= 100_000) {
    return {
      values: values.map((v) => Math.round((v / 100_000) * 100) / 100),
      fmt: "#,##0.0",
      suffix: " (₹ lakh)",
    };
  }
  return { values, fmt: "₹#,##0", suffix: "" };
}

// ─── the sheet ────────────────────────────────────────────────────────────

export function buildDashboard(
  wb: ExcelJS.Workbook,
  title: string,
  subtitle: string,
  a: ReportAnalysis,
): ChartSpec[] {
  const ws = wb.addWorksheet("Dashboard", {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  for (let c = 1; c <= GRID + 1; c++) ws.getColumn(c).width = 12.6;
  ws.getColumn(1).width = 2;

  const data = wb.addWorksheet(CHART_SHEET, { state: "hidden" });
  data.getColumn(1).width = 30;
  let dataCol = 1;
  const specs: ChartSpec[] = [];

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

  // ── the charts, two across ─────────────────────────────────────────────
  //
  // Built as a flat list first, then laid out, so the pairing does not have to
  // know what each one is.
  type Pending = Omit<ChartSpec, "anchor">;
  const pending: Pending[] = [];

  if (a.trend && a.trend.points.length > 1) {
    const pts = a.trend.points.slice(-14);
    const money = pts.some((p) => p.display.includes("₹"));
    const main = scale(pts.map((p) => p.value), money);
    const avg = main.values.reduce((s, v) => s + v, 0) / Math.max(1, main.values.length);

    const series: { name: string; values: number[] }[] = [
      { name: a.trend.valueLabel, values: main.values },
    ];
    // The period's own average, drawn as a flat dashed line across the columns
    // — the thing that turns a shape into "above or below what is normal".
    series.push({ name: a.trend.averageLabel ?? "Average for the period", values: main.values.map(() => avg) });
    const cmp = a.trend.compare?.points.slice(-14);
    if (cmp?.length === pts.length) {
      series.push({ name: a.trend.compare!.label, values: scale(cmp.map((p) => p.value), money).values });
    }

    const block = writeBlock(data, dataCol, a.trend.title, pts.map((p) => p.label), series);
    dataCol += series.length + 2;

    pending.push({
      kind: "column",
      title: a.trend.title + main.suffix,
      catRef: block.catRef,
      categories: pts.map((p) => p.label),
      numFmt: main.fmt,
      gapWidth: 45,
      series: [
        {
          name: series[0].name,
          ref: block.valRefs[0],
          values: series[0].values,
          colour: C.indigo,
          labels: "none",
        },
        {
          name: series[1].name,
          ref: block.valRefs[1],
          values: series[1].values,
          colour: C.amber,
          kind: "line",
          dashed: true,
          labels: "none",
        },
        ...(series[2]
          ? [
              {
                name: series[2].name,
                ref: block.valRefs[2],
                values: series[2].values,
                colour: C.slate,
                kind: "line" as const,
                labels: "none" as const,
              },
            ]
          : []),
      ],
    });
  }

  a.panels.slice(0, 5).forEach((panel, i) => {
    if (!panel.rows.length) return;
    const rows = panel.rows.slice(0, 12);
    const labels = rows.map((x) => x.label);
    const money = isMoneyPanel(panel);
    const sc = scale(rows.map((x) => x.value), money);

    const block = writeBlock(data, dataCol, panel.title, labels, [
      { name: panel.valueLabel, values: sc.values },
    ]);
    dataCol += 3;

    const kind = chartKindFor(panel, labels);
    const colour = SERIES[(i + 1) % SERIES.length];

    const showsUnits = kind !== "pie" && kind !== "doughnut";
    pending.push({
      kind,
      title: panel.title + (showsUnits ? sc.suffix : ""),
      catRef: block.catRef,
      categories: labels,
      numFmt: sc.fmt,
      gapWidth: kind === "bar" ? 40 : 60,
      holeSize: 58,
      legend: kind === "pie" || kind === "doughnut" ? "b" : "none",
      series: [
        {
          name: panel.valueLabel,
          ref: block.valRefs[0],
          values: sc.values,
          colour,
          pointColours: kind === "pie" || kind === "doughnut" ? [...WHEEL] : undefined,
          labels: kind === "pie" || kind === "doughnut" ? "percent" : "value",
        },
      ],
    });
  });

  for (let i = 0; i < pending.length; i += 2) {
    for (let rr = r; rr < r + CHART_ROWS; rr++) ws.getRow(rr).height = 15;
    pending.slice(i, i + 2).forEach((p, k) => {
      const c1 = 2 + k * CHART_COLS;
      specs.push({
        ...p,
        // OOXML anchors are zero-based and the "to" edge is exclusive.
        anchor: {
          fromCol: c1 - 1,
          fromRow: r - 1,
          toCol: c1 - 1 + CHART_COLS,
          toRow: r - 1 + CHART_ROWS,
        },
      });
    });
    r += CHART_ROWS + 1;
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
    r += 1;
  }

  // A hidden sheet that nobody was told about is a hidden sheet somebody finds
  // and distrusts.
  ws.mergeCells(r, 2, r, GRID + 1);
  const src = ws.getCell(r, 2);
  src.value =
    'The charts above are real Excel charts. The numbers behind them are on the hidden "Chart data" sheet — right-click any chart and choose Edit Data to see it. They describe the whole period, so they do not change when the Data sheet is filtered.';
  src.font = { name: BODY, size: 8, italic: true, color: { argb: C.ink3 } };
  src.alignment = { wrapText: true, vertical: "middle", indent: 2 };
  ws.getRow(r).height = 22;

  return specs;
}

/**
 * Which shape suits this panel.
 *
 * Composition is a doughnut; a sequence that only shrinks and a ranking of
 * long names are horizontal bars, because "BRANDS AND BOOTS PVT LTD" does not
 * fit under a column. A ranking of SHORT labels becomes a column chart — the
 * variety is the point, and it is the shape the owner's reference dashboards
 * use for exactly this case.
 */
function chartKindFor(panel: Panel, labels: string[]): ChartSpec["kind"] {
  if (panel.kind === "share") return "doughnut";
  if (panel.kind === "funnel" || panel.kind === "split") return "bar";
  const longest = Math.max(0, ...labels.map((l) => l.length));
  return labels.length <= 8 && longest <= 14 ? "column" : "bar";
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

// ─── the heat grid ────────────────────────────────────────────────────────

function drawMatrix(ws: ExcelJS.Worksheet, top: number, m: Matrix): number {
  let r = top;
  caption(ws, r, 2, GRID + 1, m.title);
  r++;

  const labelCols = 3;
  const first = 2 + labelCols;
  // From the END. Slicing from the front printed the oldest months and hid
  // the ones somebody is actually asking about. `offset` is what keeps each
  // row's values lined up with the columns that survived the slice — without
  // it the grid prints 2024's figures under 2026's headings, which is a wrong
  // number rather than a missing one.
  const shown = GRID - labelCols;
  const offset = Math.max(0, m.columns.length - shown);
  const cols = m.columns.slice(offset);

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
      cell.value = row.values[offset + i] ?? 0;
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
    (offset > 0
      ? `Showing the last ${cols.length} months; Total is of all ${m.columns.length}. `
      : "") +
    "Darker means more. A dash means nothing that month.";
  note.font = { name: BODY, size: 8, italic: true, color: { argb: C.ink3 } };
  ws.getRow(r).height = 13;
  return r + 2;
}
