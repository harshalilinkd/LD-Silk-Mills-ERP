import ExcelJS from "exceljs";

import { count, isNumeric, plural, unitFormat } from "./format";
import type { Kpi, Matrix, Panel, ReportAnalysis, ReportColumn, ReportRow, Tone } from "./types";
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

/**
 * ── THE THREE INKS ARE ALL DARK, AND THAT WAS A CORRECTION ──────────────
 *
 * `ink2` was #464B56 and `ink3` #7A8291 — greys picked so captions and notes
 * would sit quietly under the figures. On a printed page and on a projector
 * they do not sit quietly, they DISAPPEAR: the owner reported chart and
 * caption text they could not read. Hierarchy on this sheet comes from SIZE,
 * WEIGHT and CASE — a 20pt bold figure over an 8pt uppercase label — never
 * from fading text towards the paper. All three are now dark enough to read
 * at 8pt on a photocopy.
 */
export const C = {
  ink: "FF16181D",
  ink2: "FF23272F",
  ink3: "FF3C424E",
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

/**
 * ── COLOUR SAYS WHAT SOMETHING IS, NEVER WHICH CHART IT IS ───────────────
 *
 * The old code rotated six colours per panel, so the same fact was teal on one
 * chart and brown on the next and a reader learned nothing from either. The
 * house rule now, and it is the same rule the screens follow:
 *
 *   teal    normal, and the default for every comparison and ranking
 *   blue    information — a second series, a reference line
 *   green   completed, delivered, positive
 *   amber   pending, waiting, a warning
 *   red     late, critical, needs action
 *   grey    neutral — "everyone else", "not recorded"
 *
 * Amber and red are spent ONLY on warnings. A ranking's third bar is not more
 * amber than its second, so a ranking is one colour: teal.
 */
const INK_ON = {
  primary: C.teal,
  info: C.indigo,
  positive: C.green,
  warning: C.amber,
  critical: C.red,
  neutral: C.slate,
} as const;

/**
 * A composition ring. Restrained on purpose: three hues and their tints, no
 * amber and no red, because a share of the book is not a warning. Every entry
 * is dark enough to carry a white label, which is what the labels are drawn
 * in — a doughnut writes them inside the slice.
 */
const WHEEL = [
  C.teal, C.indigo, C.green,
  "FF14A79B", "FF4A5FA8", "FF3E9468",
  "FF0B6E67", "FF1F2C66", "FF245C41",
] as const;

/** Best to worst, for the one panel kind where a ramp is honest. */
const SEVERITY = [C.green, C.teal, C.indigo, C.amber, C.red] as const;

/**
 * ── A RANKING IS ONE HUE, SHADED BY RANK ────────────────────────────────
 *
 * The rule that a ranking's third bar is not "more amber" than its second
 * stands, and this does not break it: every bar is the same TEAL, and only
 * its depth changes. Depth follows position, so the shading carries the one
 * thing the chart is about — the order — instead of carrying nothing, which
 * is what a wall of identical bars carried. The owner's complaint was that
 * every chart in the pack looked like the same chart; the answer is not six
 * hues per page (that was reverted in the Sep audit, because the same fact
 * then changes colour from one page to the next) but a ramp that means
 * something inside one chart.
 *
 * Spread across the ramp rather than taken in order, so two bars use the
 * darkest and the lightest instead of two neighbouring shades nobody can
 * tell apart.
 */
const RANK_RAMP = [
  "FF0A5F59", "FF0F8F86", "FF15A79C", "FF3CBBB1", "FF6ACFC6", "FF97DFD9",
] as const;

function rampFor(n: number): string[] {
  if (n <= 1) return [RANK_RAMP[1]];
  return Array.from({ length: n }, (_, i) =>
    RANK_RAMP[Math.min(RANK_RAMP.length - 1, Math.round((i / (n - 1)) * (RANK_RAMP.length - 1)))],
  );
}

/** "Everyone else" is not a name, and grey is how a chart says so. */
const REST = C.slate;

/**
 * A status, in the house colours.
 *
 * Only reachable through `RankRow.tone`, which only a fixed-category
 * comparison sets — "Done" against "Past their day" against "Still ahead".
 * There the categories ARE the statuses, so green/red/grey is the palette
 * doing its job rather than decorating a ranking.
 */
const TONE_INK: Record<Tone, string> = {
  neutral: INK_ON.neutral,
  good: INK_ON.positive,
  warn: INK_ON.warning,
  bad: INK_ON.critical,
};

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
  /** "Party: PR EXPO", "Status: Received at Bhiwandi" — what was filtered. */
  filters: string[] = [],
  /** The rows themselves, so a page with no charts can still show the detail. */
  detail?: { columns: ReportColumn[]; rows: ReportRow[] },
): ChartSpec[] {
  const ws = wb.addWorksheet("Dashboard", {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  // GRID + 2, because the heat grid's Total column lands one past the band
  // when the grid is at full width and otherwise keeps Excel's default,
  // printing a seven-figure total as ####.
  for (let c = 1; c <= GRID + 2; c++) ws.getColumn(c).width = 12.6;
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
  r++;

  // ── WHAT WAS FILTERED, ON THE FACE OF THE PAGE ─────────────────────────
  //
  // Excel cannot offer live slicers, so the honest equivalent is to state the
  // selection where the figures are. A dashboard filtered to one customer and
  // not saying so is the single easiest way to have a number quoted as if it
  // covered the whole business.
  ws.mergeCells(r, 2, r, GRID + 1);
  const fl = ws.getCell(r, 2);
  fl.value = filters.length ? `Filtered by — ${filters.join("   ·   ")}` : "No filters applied — this is the whole period";
  fl.font = { name: BODY, size: 9, bold: filters.length > 0, color: { argb: filters.length ? C.teal : C.ink3 } };
  ws.getRow(r).height = 14;
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
  type Pending = Omit<ChartSpec, "anchor"> & { note?: string; primary?: boolean };
  const pending: Pending[] = [];
  /** Panels that turned out to hold a single fact. Rendered as cards, not charts. */
  const summaries: { title: string; label: string; value: string }[] = [];

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

    // ── SAY SO WHEN MONTHS WERE DROPPED ─────────────────────────────────
    //
    // The chart takes the last fourteen points. Goods Return spans 24 months,
    // so "What came back each month" summed to Rs 2.29 cr on a sheet whose
    // Total said Rs 3.14 cr, with nothing anywhere saying why. The heat grid
    // already admits its own truncation; this one has to as well, and the
    // title is the only place a chart can say it.
    const dropped = a.trend.points.length - pts.length;
    // A movement over time is a LINE. It was a column chart, which reads as
    // twelve separate measurements rather than one thing changing, and a
    // dashed average laid over columns is a rule nobody can follow.
    pending.push({
      kind: "column", // no bar series in it, so this plots as a pure line chart
      primary: true,
      title:
        a.trend.title +
        (dropped > 0 ? ` — last ${pts.length} of ${a.trend.points.length} months` : "") +
        main.suffix,
      subtitle:
        `${a.trend.valueLabel} by month, against the period average` +
        (series[2] ? `, with ${series[2].name.toLowerCase()} behind it` : ""),
      note: dropped > 0
        ? `The earlier ${dropped} months are not on this chart; the figures above cover all of them.`
        : undefined,
      catRef: block.catRef,
      categories: pts.map((p) => p.label),
      numFmt: main.fmt,
      legend: "b",
      series: [
        {
          name: series[0].name,
          ref: block.valRefs[0],
          values: series[0].values,
          colour: INK_ON.primary,
          kind: "line",
          labels: "none",
        },
        {
          name: series[1].name,
          ref: block.valRefs[1],
          values: series[1].values,
          colour: INK_ON.neutral,
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
                colour: INK_ON.info,
                kind: "line" as const,
                labels: "none" as const,
              },
            ]
          : []),
      ],
    });
  }

  // ── SIX, NOT FIVE — AND THE SIXTH WAS BEING BUILT AND THROWN AWAY ──────
  //
  // This was `slice(0, 5)`. Production status declares six panels, so
  // "Which fabric is holding things up" was computed on every run and never
  // drawn, with nothing anywhere to say so — a silent cut is the worst kind,
  // because the page looks finished. An audit across all twelve reports
  // found exactly one panel in that position, so raising the cap recovers
  // it and changes nothing else.
  //
  // Six also LAYS OUT better than five: charts are placed two across, so
  // five leaves a half-empty final row and six fills three rows evenly.
  // Past six the page stops being one screen, which is the rule the KPI
  // band already follows.
  a.panels.slice(0, 6).forEach((panel) => {
    // A panel with nothing in it, or one whose every bar is zero — an ageing
    // panel emits its five buckets whatever happens and a funnel its seven
    // stages, so an empty period drew a chart of five zero bars. Not wrong,
    // but noise dressed as information.
    if (!panel.rows.length || !panel.rows.some((r) => r.value !== 0)) return;
    let rows = panel.rows.slice(0, 12);

    // ── ONE BAR IS NOT A CHART ──────────────────────────────────────────
    //
    // The Checklist has one person, one frequency and one department, so this
    // drew three charts each showing a single bar of length 1 — half a page
    // spent on three facts a line of text carries better. A panel with one
    // category becomes a summary card instead.
    //
    // Counting NON-ZERO categories is right for a ranking and wrong for a
    // panel whose categories come from the question: `Money in ₹0 · Money out
    // ₹5,000` has one non-zero bar and is still a real comparison, and it was
    // this line — not the panels — that kept the thin dashboards empty after
    // the fixed-category panels were added. `fixedCategories` says which is
    // which; the all-zero guard above still drops a genuinely empty period.
    const drawable = panel.fixedCategories
      ? rows.length
      : rows.filter((x) => x.value !== 0).length;
    if (drawable < 2) {
      const only = rows.find((x) => x.value !== 0)!;
      summaries.push({ title: panel.title, label: only.label, value: only.display || String(only.value) });
      return;
    }

    // ── A DOUGHNUT MUST BE THE WHOLE, OR ITS PERCENTAGES LIE ────────────
    //
    // Excel rebases pie labels over the points it is given, so the top five
    // names were labelled as shares of each other: PR EXPO read 68.0% beside
    // a KPI card saying 25.8%. Each row already knows its share of the whole,
    // so the missing remainder is recoverable and gets its own slice.
    if (panel.kind === "share") {
      // FOUR names and the remainder, so the ring never carries more than the
      // five slices a person can tell apart at a glance.
      rows = rows.slice(0, 4);
      const shown = rows.reduce((s, r) => s + r.value, 0);
      const sharePct = rows.reduce((s, r) => s + (r.share ?? 0), 0);
      if (sharePct > 0 && sharePct < 99.5) {
        const whole = shown / (sharePct / 100);
        const rest = whole - shown;
        if (rest > 0) {
          rows = [...rows, { label: "Everyone else", value: rest, display: "", share: 100 - sharePct }];
        }
      }
    }
    const labels = rows.map((x) => x.label);
    const money = isMoneyPanel(panel);
    const sc = scale(rows.map((x) => x.value), money);

    const block = writeBlock(data, dataCol, panel.title, labels, [
      { name: panel.valueLabel, values: sc.values },
    ]);
    dataCol += 3;

    const kind = chartKindFor(panel, labels);
    const isRing = kind === "doughnut" || kind === "pie";

    // ── ONE COLOUR, UNLESS THE COLOURS THEMSELVES SAY SOMETHING ────────
    //
    // A ranking gets teal and only teal: its third bar is not more amber than
    // its second. A composition gets the restrained ring. An AGEING panel is
    // the one place a ramp is honest, because its rows run best to worst — and
    // "Everyone else" is grey wherever it appears, because it is not a name.
    let pointColours: string[] | undefined;
    if (isRing) {
      pointColours = labels.map((l, k) => (l === "Everyone else" ? REST : WHEEL[k % WHEEL.length]));
    } else if (panel.tone === "severity") {
      pointColours = labels.map((_, k) => SEVERITY[Math.min(k, SEVERITY.length - 1)]);
    } else if (rows.some((x) => x.tone)) {
      // A comparison of statuses, so the colours are the statuses. A row that
      // did not declare one stays the primary teal rather than borrowing a
      // meaning it was never given.
      pointColours = rows.map((x) => (x.tone ? TONE_INK[x.tone] : INK_ON.primary));
    } else {
      // A ranking or a funnel: one hue, deepest at the top.
      pointColours = rampFor(labels.length);
    }

    pending.push({
      note: panel.note,
      kind,
      title: panel.title + (isRing ? "" : sc.suffix),
      subtitle: subtitleFor(panel, kind, labels.length, labels.includes("Everyone else")),
      catRef: block.catRef,
      categories: labels,
      numFmt: sc.fmt,
      // Fat bars on a ranking of twelve; slim columns on a comparison of two,
      // where Excel's default would otherwise draw two slabs touching.
      gapWidth: kind === "column" ? 110 : 40,
      holeSize: 58,
      legend: isRing ? "b" : "none",
      series: [
        {
          name: panel.valueLabel,
          ref: block.valRefs[0],
          values: sc.values,
          colour: INK_ON.primary,
          pointColours,
          labels: isRing ? "percent" : "value",
        },
      ],
    });
  });

  // ── SUMMARY CARDS: the panels that turned out to be one fact ─────────
  if (summaries.length) {
    caption(ws, r, 2, GRID + 1, "In short");
    r++;
    const span = Math.floor(GRID / Math.min(3, summaries.length));
    summaries.slice(0, 3).forEach((s, k) => {
      const c1 = 2 + k * span;
      const c2 = c1 + span - 1;
      ws.getRow(r).height = 13;
      ws.getRow(r + 1).height = 20;
      for (let rr = r; rr <= r + 1; rr++) for (let c = c1; c <= c2; c++) fill(ws.getCell(rr, c), C.paper);
      ws.mergeCells(r, c1, r, c2);
      const lab = ws.getCell(r, c1);
      lab.value = s.title.toUpperCase();
      lab.font = { name: BODY, size: 8, bold: true, color: { argb: C.ink3 } };
      lab.alignment = { vertical: "middle", indent: 1 };
      ws.mergeCells(r + 1, c1, r + 1, c2);
      const val = ws.getCell(r + 1, c1);
      val.value = `${s.label} — ${s.value}`;
      val.font = { name: HEAD, size: 12, bold: true, color: { argb: C.teal } };
      val.alignment = { vertical: "middle", indent: 1 };
      outline(ws, r, c1, r + 1, c2, C.rule);
    });
    r += 3;
  }

  // ── THE CHARTS ──────────────────────────────────────────────────────
  //
  // The PRIMARY chart — the movement over time — leads the page at full
  // width, because "what has changed" is the first question a manager asks.
  // Everything after it pairs up two across at a fixed size, so the page
  // reads as a grid rather than a scrapbook.
  const place = (p: (typeof pending)[number], c1: number, cols: number) => {
    const plotRows = CHART_ROWS - 2;
    specs.push({
      ...p,
      // OOXML anchors are zero-based and the "to" edge is exclusive.
      anchor: {
        fromCol: c1 - 1,
        fromRow: r - 1,
        toCol: c1 - 1 + cols,
        toRow: r - 1 + plotRows,
      },
    });
    if (p.note) {
      const noteRow = r + plotRows;
      ws.mergeCells(noteRow, c1, noteRow + 1, c1 + cols - 1);
      const cell = ws.getCell(noteRow, c1);
      cell.value = p.note;
      cell.font = { name: BODY, size: 8.5, italic: true, color: { argb: C.ink3 } };
      cell.alignment = { wrapText: true, vertical: "top" };
    }
  };

  const primary = pending.filter((p) => p.primary);
  const rest = pending.filter((p) => !p.primary);

  for (const p of primary) {
    for (let rr = r; rr < r + CHART_ROWS; rr++) ws.getRow(rr).height = 15;
    place(p, 2, GRID);
    r += CHART_ROWS + 1;
  }

  for (let i = 0; i < rest.length; i += 2) {
    for (let rr = r; rr < r + CHART_ROWS; rr++) ws.getRow(rr).height = 15;
    rest.slice(i, i + 2).forEach((p, k) => place(p, 2 + k * CHART_COLS, CHART_COLS));
    r += CHART_ROWS + 1;
  }

  // ── WHEN THERE IS NOTHING TO CHART, SAY SO AND SHOW THE ROWS ────────
  //
  // Petty Cash, the Checklist and Help Slip each hold ONE row today, so every
  // panel has a single category and the house rule turns each into a card
  // rather than a chart of one bar. That rule is right — a bar of length one
  // is the thing that started this — but it left those three pages looking
  // half-finished beside the Orders pack.
  //
  // So the chart band is filled with two things instead: a line saying what a
  // chart needs before it can appear, and the rows themselves, which is the
  // detail table the pack is supposed to end with anyway.
  if (!specs.length && (summaries.length || (detail && detail.rows.length))) {
    ws.mergeCells(r, 2, r + 1, GRID + 1);
    const why = ws.getCell(r, 2);
    why.value =
      "Charts appear here as soon as there is more than one thing to compare — a second payee, a second month, a second person. " +
      "With a single row there is nothing a chart could show that the figures above do not already say, so this page shows the rows instead.";
    why.font = { name: BODY, size: 9.5, italic: true, color: { argb: C.ink3 } };
    why.alignment = { wrapText: true, vertical: "middle", indent: 2 };
    for (let rr = r; rr <= r + 1; rr++) for (let c = 2; c <= GRID + 1; c++) fill(ws.getCell(rr, c), C.paper);
    ws.getCell(r, 2).border = { left: { style: "medium", color: { argb: C.teal } } };
    ws.getRow(r).height = 17;
    ws.getRow(r + 1).height = 17;
    r += 3;
  }

  // ── NOTHING AT ALL ──────────────────────────────────────────────────
  //
  // An empty period used to leave a blank half-page under the figure strip
  // and let the reader wonder whether the file had failed.
  if (!pending.length && !summaries.length) {
    ws.mergeCells(r, 2, r + 1, GRID + 1);
    const none = ws.getCell(r, 2);
    none.value = "No data available for the selected period.";
    none.font = { name: HEAD, size: 12, bold: true, color: { argb: C.ink3 } };
    none.alignment = { horizontal: "center", vertical: "middle" };
    for (let rr = r; rr <= r + 1; rr++) for (let c = 2; c <= GRID + 1; c++) fill(ws.getCell(rr, c), C.paper);
    outline(ws, r, 2, r + 1, GRID + 1, C.rule);
    ws.getRow(r).height = 20;
    ws.getRow(r + 1).height = 20;
    r += 3;
  }

  // ── NEEDS ATTENTION ─────────────────────────────────────────────────
  //
  // Not a new judgement: every report already marks its own KPIs `bad` or
  // `warn`, and those are exactly the figures somebody has to do something
  // about. Gathering them into one strip answers "where is the problem" without
  // making a manager read twelve tiles to find the two that are red.
  const attention = a.kpis.filter((k) => k.tone === "bad" || k.tone === "warn");
  if (attention.length) {
    caption(ws, r, 2, GRID + 1, "Needs attention", C.red);
    r++;
    for (const k of attention.slice(0, 6)) {
      const tone = k.tone === "bad" ? { fg: C.red, bg: C.redDim } : { fg: C.amber, bg: C.amberDim };
      ws.getRow(r).height = 17;
      for (let c = 2; c <= GRID + 1; c++) fill(ws.getCell(r, c), tone.bg);
      const label = ws.getCell(r, 2);
      ws.mergeCells(r, 2, r, 5);
      label.value = k.label;
      label.font = { name: BODY, size: 10, color: { argb: C.ink2 } };
      label.alignment = { vertical: "middle", indent: 2 };
      const val = ws.getCell(r, 6);
      ws.mergeCells(r, 6, r, 7);
      val.value = k.value;
      val.font = { name: HEAD, size: 11, bold: true, color: { argb: tone.fg } };
      val.alignment = { vertical: "middle" };
      const sub = ws.getCell(r, 8);
      ws.mergeCells(r, 8, r, GRID + 1);
      sub.value = k.sub ?? "";
      sub.font = { name: BODY, size: 9, color: { argb: C.ink3 } };
      sub.alignment = { vertical: "middle" };
      ws.getCell(r, 2).border = { left: { style: "medium", color: { argb: tone.fg } } };
      r++;
    }
    r += 1;
  }

  // ── the heat grid ──────────────────────────────────────────────────────
  if (a.matrix && a.matrix.rows.length) r = drawMatrix(ws, r, a.matrix);

  // ── THE MANAGEMENT TABLE, AT THE FOOT OF EVERY PAGE ────────────────────
  //
  // A management pack ends in the detail. It used to be drawn only on the
  // pages that had no charts, which made it look like an apology for a thin
  // report rather than the closing section it is — and it left the ten pages
  // that DO have charts ending on a sentence, with nothing on them a reader
  // could point at and say "show me one of those".
  //
  // Ten rows and twelve columns, so the page still prints; the Data sheet is
  // where the rest lives and the footnote under the table says so.
  if (detail && detail.rows.length) r = drawDetail(ws, r, detail.columns, detail.rows);

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
  src.value = specs.length
    ? 'The charts above are real Excel charts. The numbers behind them are on the hidden "Chart data" sheet — right-click any chart and choose Edit Data to see it. They describe the whole period, so they do not change when the Data sheet is filtered.'
    : "Every row behind these figures is on the Data sheet, and what each column means is on the Notes sheet.";
  src.font = { name: BODY, size: 8, italic: true, color: { argb: C.ink3 } };
  src.alignment = { wrapText: true, vertical: "middle", indent: 2 };
  ws.getRow(r).height = 22;

  return specs;
}

/**
 * Which shape suits this panel. Three answers, and each is decided by what the
 * panel IS rather than by how its labels happen to look.
 *
 *   · A COMPOSITION is a doughnut, and only while it has two to five slices.
 *     Beyond that the wedges stop being tellable apart and a bar says it
 *     better.
 *   · A FIXED-CATEGORY COMPARISON is a clustered COLUMN — money in against
 *     money out, done against still to do, settled against still open. Two or
 *     three totals stood side by side on a common baseline is how that
 *     comparison is read everywhere else in business, and the categories are
 *     short words rather than party names, so nothing needs the horizontal
 *     room.
 *   · EVERYTHING ELSE IS A HORIZONTAL BAR. Rankings, funnels and ageing are
 *     all "which of these is biggest", read against a common baseline, with
 *     room for a party name that runs to thirty characters.
 *
 * ── WHY THE COLUMN CHART IS BACK, AND WHY THIS IS NOT THE OLD BUG ────────
 *
 * It was removed because it used to be picked by a HEURISTIC ON LABEL LENGTH,
 * so the same question was drawn two different ways in one workbook depending
 * on whose name happened to be short. That was the defect — the guess, not the
 * shape. This rule reads `fixedCategories`, which the report itself sets to
 * declare that its categories come from the question and not from the data.
 * A given panel therefore draws the same way in every period and every filter,
 * which is the property that was actually missing.
 *
 * Time series are a LINE, decided where the trend is built rather than here.
 */
function chartKindFor(panel: Panel, labels: string[]): ChartSpec["kind"] {
  if (panel.kind === "share" && labels.length >= 2 && labels.length <= 5) return "doughnut";
  if (panel.fixedCategories && labels.length <= 4) return "column";
  return "bar";
}

/**
 * The line under a chart's title: what the chart is OF.
 *
 * A title asks the question ("Who buys the most"); a manager also has to know
 * the SCOPE of the answer before quoting it, and "Top 10 of 212 customers" is
 * the difference between a ranking and a total. Written from the panel, so it
 * cannot drift from what was drawn, and kept to one short line — a subtitle
 * that wraps eats the plot area it is describing.
 */
function subtitleFor(
  panel: Panel,
  kind: ChartSpec["kind"],
  shown: number,
  hasRest: boolean,
): string {
  const what = panel.valueLabel.toLowerCase();
  const total = panel.rows.length;
  if (kind === "doughnut" || kind === "pie") {
    return hasRest
      ? `Share of total ${what} — the top ${shown - 1} named, the rest grouped`
      : `Share of total ${what}`;
  }
  if (kind === "column") return `${panel.valueLabel} in the period, side by side`;
  if (panel.kind === "funnel") return `${panel.valueLabel} surviving each stage, in order`;
  if (panel.tone === "severity") return `${panel.valueLabel} by age, oldest last`;
  // NEVER "All 10". A ranking panel is already a top-N — `rank()` cuts at ten
  // — so the panel cannot see how many customers there were, and a subtitle
  // saying "all" over the ten biggest of two hundred is the kind of sentence
  // that gets quoted. It states what is DRAWN and claims nothing else.
  // The value label leads, unchanged. "By ${what}" was tried and produced
  // "By paid out, highest first" — the labels are noun phrases written for a
  // column heading ("Paid out", "Value", "Entries"), and a preposition in
  // front of one is a sentence nobody would say.
  return total > shown
    ? `${panel.valueLabel} — the top ${shown} of ${count(total)}, highest first`
    : `${panel.valueLabel}, highest first`;
}

// ─── KPI cards ────────────────────────────────────────────────────────────

function drawKpis(ws: ExcelJS.Worksheet, top: number, all: Kpi[]): number {
  const perRow = 3;
  const span = 4; // 3 cards × 4 columns = B..M, so each figure has room
  let r = top;

  // The first six are the decision figures. Reports order their KPIs by
  // importance, so this is a cut, not a choice.
  const kpis = all.slice(0, 6);
  const overflow = all.slice(6);

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
      val.font = { name: HEAD, size: 20, bold: true, color: { argb: tone.fg } };
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

  if (overflow.length) {
    ws.mergeCells(r, 2, r, GRID + 1);
    const more = ws.getCell(r, 2);
    more.value =
      "Also — " +
      overflow.map((k) => `${k.label}: ${k.value}${k.sub ? ` (${k.sub})` : ""}`).join("   ·   ");
    more.font = { name: BODY, size: 9, color: { argb: C.ink3 } };
    more.alignment = { wrapText: true, vertical: "middle", indent: 1 };
    ws.getRow(r).height = Math.max(16, Math.ceil(more.value.length / 150) * 14);
    r += 2;
  }
  return r;
}

/**
 * The management table — the first rows, on the dashboard itself.
 *
 * Every page ends here. The Data sheet holds every row and every column; this
 * is the closing section of the pack, the part a manager points at to ask
 * "show me one of these", and it is drawn to the SAME rules as the Data sheet
 * — Indian digit grouping, DD MMM YYYY, units inside the cell, status badges.
 * Two tables in one workbook that format the same column differently is the
 * reader wondering which of them is the real one.
 *
 * Columns are taken in order and stop at twelve, because the sheet is twelve
 * wide and a table that runs off the printed page is worse than a short one.
 */
function drawDetail(
  ws: ExcelJS.Worksheet,
  top: number,
  columns: ReportColumn[],
  rows: ReportRow[],
): number {
  const MAX_ROWS = 10;
  let r = top;

  // ── COLUMNS GET THE WIDTH THEIR CONTENT NEEDS ─────────────────────────
  //
  // Every column of this sheet is 12.6 characters wide, because the same
  // twelve columns carry the KPI tiles and the charts. That is fine for a
  // date or a figure and it CLIPS a party name — "777 THE PREMIUM FASHION"
  // arrived as "777 THE PREMIUM", which on the page a manager reads is a
  // different customer. So a text column takes two of the twelve and the
  // cells are merged; the table shows fewer columns and every one of them is
  // readable, which is the right way round for a management pack. The Data
  // sheet still carries all of them at their own widths.
  const WIDE = 2;
  const picked: { c: ReportColumn; at: number; span: number }[] = [];
  let used = 0;
  for (const c of columns.filter((x) => !x.optional)) {
    if (used >= GRID) break;
    const span = Math.min(c.type === "text" || c.type === "datetime" ? WIDE : 1, GRID - used);
    picked.push({ c, at: 2 + used, span });
    used += span;
  }

  const paint = (row: number, at: number, span: number, argb: string) => {
    for (let c = at; c < at + span; c++) fill(ws.getCell(row, c), argb);
  };

  // ── THE FIRST TEN ROWS ARE NOT A SAMPLE — THEY ARE ONE ORDER ─────────
  //
  // The data sheet is sorted by whatever the report's own query asked for
  // (Line Detail: most recent order first, then fabric, then design), so a
  // head-slice of ten showed order 1304's ten design lines and nothing else
  // — ten rows that answer nothing a single row didn't already answer. A
  // management table is supposed to show the biggest transactions, not
  // the most recent order's line count. Where the report has a genuinely
  // additive money/quantity column (`total: "sum"`), the ten shown are the
  // ten LARGEST by that column instead — different orders, different
  // parties, the rows a manager would actually ask to see.
  // Same "what does this column's total mean" resolution the Data sheet's
  // own footer uses (`xlsx.ts`): explicit `total`, else `sum` for anything
  // numeric. Reusing it means a column ranked here is a column that is
  // ALSO added up at the foot of the Data sheet — never a percentage or an
  // average pretending to be a value.
  const effectiveTotal = (c: ReportColumn) => c.total ?? (isNumeric(c.type) ? "sum" : "none");
  const valueCol = columns.find((c) => effectiveTotal(c) === "sum" && c.type === "money")
    ?? columns.find((c) => effectiveTotal(c) === "sum");
  const sortedByValue = !!valueCol;
  const shown = sortedByValue
    ? [...rows].sort((a, b) => Number(b[valueCol!.key] ?? 0) - Number(a[valueCol!.key] ?? 0)).slice(0, MAX_ROWS)
    : rows.slice(0, MAX_ROWS);

  caption(ws, r, 2, GRID + 1, "The detail behind these figures");
  r++;

  ws.getRow(r).height = 18;
  picked.forEach(({ c, at, span }) => {
    if (span > 1) ws.mergeCells(r, at, r, at + span - 1);
    const cell = ws.getCell(r, at);
    cell.value = c.label;
    cell.font = { name: BODY, size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    paint(r, at, span, C.indigo);
    cell.alignment = { vertical: "middle", horizontal: isNumeric(c.type) ? "right" : "left" };
  });
  r++;

  shown.forEach((row, k) => {
    ws.getRow(r).height = 15;
    picked.forEach(({ c, at, span }) => {
      if (span > 1) ws.mergeCells(r, at, r, at + span - 1);
      const cell = ws.getCell(r, at);
      const v = row[c.key];
      if (v === null || v === undefined) cell.value = null;
      else if (c.type === "date") cell.value = new Date(`${String(v).slice(0, 10)}T00:00:00Z`);
      else if (c.type === "boolean") cell.value = v ? "Yes" : "No";
      else if (isNumeric(c.type)) cell.value = Number(v);
      else cell.value = String(v);
      // The unit rides inside the number format, exactly as on the Data sheet,
      // so `900.00 MTR` reads as a quantity in both places and still sums.
      const fmt = unitFormat(c);
      if (fmt) cell.numFmt = fmt;
      cell.font = { name: BODY, size: 9, color: { argb: C.ink2 } };
      cell.alignment = { vertical: "middle", horizontal: isNumeric(c.type) ? "right" : "left" };

      // ── ONLY THE EXCEPTIONS ARE COLOURED ──────────────────────────────
      //
      // The column says what each of its values MEANS — "Cancelled: Yes" is
      // bad and "Received: Yes" is good, and nothing but the column knows
      // which. A tint with the word still in it survives a print and a reader
      // who cannot tell the two hues apart.
      const tone = c.badge?.[String(cell.value ?? "")];
      if (tone && tone !== "neutral") {
        const b = TONE[tone];
        paint(r, at, span, b.bg);
        cell.font = { name: BODY, size: 9, bold: true, color: { argb: b.fg } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      } else if (k % 2 === 1) {
        paint(r, at, span, C.paper);
      }
    });
    r++;
  });

  ws.mergeCells(r, 2, r, GRID + 1);
  const note = ws.getCell(r, 2);
  const cols =
    picked.length < columns.length
      ? ` and the first ${picked.length} of ${columns.length} columns`
      : "";
  note.value =
    rows.length > MAX_ROWS
      ? sortedByValue
        ? `The ${MAX_ROWS} biggest of ${plural(rows.length, "row")}${cols}, by ${valueCol!.label.toLowerCase()}. Every row and every column is on the Data sheet.`
        : `The first ${MAX_ROWS} of ${plural(rows.length, "row")}${cols}. Every row and every column is on the Data sheet.`
      : rows.length === 1
        ? `The only row on record${cols}. Every column of it is on the Data sheet, and what each one means is on Notes.`
        : `All ${plural(rows.length, "row")}${cols}. Every column is on the Data sheet, and what each one means is on Notes.`;
  note.font = { name: BODY, size: 8, italic: true, color: { argb: C.ink3 } };
  ws.getRow(r).height = 13;
  return r + 2;
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

  // The grid's own row cap. `matrixFrom`'s `limit` already decided how many
  // labels are worth carrying — this only guards against a chart's `limit`
  // being raised so high the sheet stops being a page. 40 keeps a report like
  // Line Detail's fabric grid (raised from 8) intact without the guard firing.
  const MAX_MATRIX_ROWS = 40;
  const firstDataRow = r;
  for (const row of m.rows.slice(0, MAX_MATRIX_ROWS)) {
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

  const shownRows = Math.min(m.rows.length, MAX_MATRIX_ROWS);
  ws.mergeCells(r, 2, r, GRID + 1);
  const note = ws.getCell(r, 2);
  note.value =
    (m.note ? m.note + "  " : "") +
    (m.format === "money" ? "Figures in thousands of rupees. " : "") +
    (offset > 0
      ? `Showing the last ${cols.length} of ${m.columns.length} months; the Total is of those ${m.columns.length}. `
      : "") +
    (m.totalLabels && m.totalLabels > shownRows
      ? `Top ${shownRows} of ${m.totalLabels}, by value; the rest are on the Data sheet. `
      : "") +
    "Darker means more. A dash means nothing that month.";
  note.font = { name: BODY, size: 8, italic: true, color: { argb: C.ink3 } };
  ws.getRow(r).height = 13;
  return r + 2;
}
