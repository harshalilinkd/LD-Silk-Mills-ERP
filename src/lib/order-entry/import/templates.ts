// The two blank workbooks somebody fills in before an import.
//
// ═══════════════════════════════════════════════════════════════════════════
//  A TEMPLATE IS ONLY WORTH ANYTHING IF IT IMPORTS CLEANLY ITSELF
// ═══════════════════════════════════════════════════════════════════════════
//
// Both of these are checked in `.scratch/templates-verify.mts` by running them
// back through the real importers: every column has to auto-map, and the sample
// rows have to produce a plan with no errors. A template whose headings the
// mapper does not recognise is worse than no template at all — it teaches a
// shape the system then refuses, and the person who filled in four hundred rows
// is the one who finds out.
//
// ── THE SAMPLE ROWS ARE THE DOCUMENTATION ─────────────────────────────────
//
// They are not filler. Each one demonstrates something the importer does that
// a blank header row cannot express: that the order number and party are
// written ONCE and left blank underneath, that the fabric is written once per
// block, that a cancelled line says `Cancelled` and a live one says `OK`, that
// `LINKD` goes in its own column rather than being implied. Somebody copying
// the shape of the samples gets those right without reading anything.
//
// They are also obviously fake (`SAMPLE-1`) and the notes sheet says to delete
// them, because the one thing worse than no sample is a sample that gets
// imported as a real order.

import { STAGE_LABELS, type StageKey } from "@/lib/order-entry/workflow-constants";

type Cell = string | number | null;

/** ExcelJS is large and only needed when somebody actually asks for a file. */
async function workbook() {
  const ExcelJS = (await import("exceljs")).default;
  return new ExcelJS.Workbook();
}

const INK = "FF1F2933";
const HEAD_FILL = "FFE8EDF2";
const GROUP_FILL = "FFD8E3EC";
const SAMPLE_INK = "FF6B7280";

// ─── orders ───────────────────────────────────────────────────────────────

const ORDER_HEADERS = [
  "ORDER DATE",
  "ORDER NO.",
  "PARTY NAME",
  "SALES PERSON",
  "AGENT",
  "HASTE",
  "TRANSPORT",
  "CHALLAN NO.",
  "LOT NO.",
  "DEPT.",
  "ORDER REMARKS",
  "FABRIC",
  "DESIGN NO",
  "QTY (MTR)",
  "RATE",
  "CANCELLED",
  "LINE REMARKS",
  "AMOUNT",
] as const;

/** Which headings describe the ORDER, so the notes can say what to leave blank. */
const ORDER_LEVEL_UPTO = 11; // indexes 0..10 are order-level, 11+ are the line

const ORDER_SAMPLES: Cell[][] = [
  // One order, four designs, two fabrics. Everything order-level appears on the
  // first row only; the fabric appears on the first row of each fabric block.
  ["12-06-2026", "SAMPLE-1", "EXAMPLE TEXTILES", "Surendra", "Royal Fabrics", "", "MATESHWARI TRANSPORT", "CH-101", "LOT-9", "LD", "", "LORDS-1", "01", 60, 150, "OK", "", 9000],
  ["", "", "", "", "", "", "", "", "", "", "", "", "02", 60, 150, "OK", "", 9000],
  ["", "", "", "", "", "", "", "", "", "", "", "LORDS-2", "411124A", 100.5, 82.5, "OK", "", 8291.25],
  ["", "", "", "", "", "", "", "", "", "", "", "", "411124B", 60, 82.5, "Cancelled", "party cancelled", 4950],
  // A second order, in the other department, written out in full on every row —
  // which the importer accepts just as happily.
  ["13-06-2026", "SAMPLE-2", "ANOTHER EXAMPLE CO", "", "", "", "", "", "", "LINKD", "", "Star Print", "15", 50, 165, "OK", "", 8250],
  ["13-06-2026", "SAMPLE-2", "ANOTHER EXAMPLE CO", "", "", "", "", "", "", "LINKD", "", "Wax Print", "9", 60, 185, "OK", "", 11100],
];

const ORDER_NOTES: [string, string][] = [
  ["Delete the two SAMPLE rows before you import.", "They are there to show the shape. If you leave them in, two orders called SAMPLE-1 and SAMPLE-2 are created."],
  ["Only ORDER DATE, ORDER NO. and PARTY NAME are compulsory.", "Plus FABRIC, DESIGN NO and QTY (MTR) on every design line. Everything else can be left empty."],
  ["One row per DESIGN, not per order.", "An order with four designs is four rows."],
  ["Leave the order columns blank under the first row.", "ORDER DATE through ORDER REMARKS only need filling on the first row of each order — a blank means the row above. Write them on every row if you prefer; both work."],
  ["FABRIC works the same way inside an order.", "Write it once and leave it blank for the designs under it. A new fabric starts a new block."],
  ["CANCELLED: write OK for a live line, Cancelled for a dead one.", "Blank also means live. Anything the importer does not recognise is refused rather than guessed, so do not invent new words here."],
  ["DEPT.: LD or LINKD.", "Leave it empty and the order is stored as LD, which would quietly merge the two departments. Fill it in."],
  ["Dates are DAY first: 12-06-2026 is 12 June.", "05/06/2026 is read as 5 June and the import warns about it, because nothing in the cell says which was meant."],
  ["DESIGN NO is TEXT, not a number.", "That column is formatted as text so 01 stays 01 instead of becoming 1. Do not reformat it."],
  ["AMOUNT is CHECKED, never imported.", "The system computes qty x rate itself. If your figure disagrees, the import reports it — which is the point of the column."],
  ["An order number already in the system is SKIPPED.", "Nothing you have entered since May can be overwritten, and running the same file twice is harmless."],
  ["New party, fabric, agent or transport names are offered at the end.", "You tick which ones to add to the master lists, so a typed-twice name does not become two customers."],
];

export async function buildOrdersTemplate(): Promise<Blob> {
  const wb = await workbook();
  const ws = wb.addWorksheet("Orders");

  ws.addRow([...ORDER_HEADERS]);
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: INK }, size: 10 };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
  head.alignment = { vertical: "middle" };
  head.height = 22;

  // DESIGN NO must be text or Excel eats the leading zero — the one formatting
  // decision here that changes what imports rather than how it looks.
  ws.getColumn(ORDER_HEADERS.indexOf("DESIGN NO") + 1).numFmt = "@";

  for (const r of ORDER_SAMPLES) {
    const row = ws.addRow(r);
    row.font = { italic: true, color: { argb: SAMPLE_INK }, size: 10 };
  }

  ORDER_HEADERS.forEach((h, i) => {
    const c = ws.getColumn(i + 1);
    c.width = Math.max(11, Math.min(24, h.length + 4));
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];

  addNotes(wb, "How to fill this in", ORDER_NOTES, [
    "Order Entry rules → Import → Orders",
    `Order columns: ${ORDER_HEADERS.slice(0, ORDER_LEVEL_UPTO).join(", ")}`,
    `Design line columns: ${ORDER_HEADERS.slice(ORDER_LEVEL_UPTO).join(", ")}`,
  ]);

  return blobOf(await wb.xlsx.writeBuffer());
}

// ─── production status ────────────────────────────────────────────────────

// ORDER DATE and PARTY NAME are here to be CHECKED, never written. The old
// sheet's order numbers overlap the new system's, so finding an order with the
// right number proves nothing on its own — see StatusColumnMap in
// `status-build.ts`. A row whose date disagrees is refused rather than written
// onto somebody else's order.
const STATUS_IDENTITY = [
  "ORDER NO.",
  "ORDER DATE",
  "PARTY NAME",
  "FABRIC",
  "DESIGN NO",
  "QTY (MTR)",
] as const;

/**
 * The stage blocks, in the order the sheet lays them out.
 *
 * `on_hold` sits where the old workbook puts it — after stock checking — even
 * though it is an aside rather than a step, because that is where the people
 * filling this in expect to find it. Nothing about the column ORDER tells the
 * importer anything: the stage is recognised by its NAME.
 */
const STATUS_STAGES: StageKey[] = [
  "order_entry",
  "stock_checking",
  "on_hold",
  "rolling_checking",
  "challan",
  "bill",
  "dispatch",
  "received_lr",
];

const STATUS_SUB = ["Planned", "Actual", "Status", "Time Delay"] as const;

const STATUS_NOTES: [string, string][] = [
  ["Import the ORDERS first.", "This sheet does not create anything. It finds a design line that is already in the system and ticks its stages. A row whose order is not there is reported, not added."],
  ["Delete the SAMPLE rows before you import.", "They are there to show the shape."],
  ["A row is found by ORDER NO. + FABRIC + DESIGN NO.", "Those three must match the order exactly. QTY (MTR) is only cross-checked and a difference is reported, not refused."],
  ["ORDER DATE has to match the order in the system.", "The old sheet and the new system use the same numbering, so the same number can be two different orders. A row whose date disagrees is refused rather than written onto the wrong one. A differently-spelt PARTY NAME on the right date is only a warning."],
  ["Status: write TRUE or Done for a finished stage, FALSE or blank for one that is not.", "OK also means done HERE. (On the orders sheet OK means the opposite - not cancelled - which is why the two sheets are read by different rules.)"],
  ["Stock checking uses Yes / No.", "Yes means in stock, which is what lets the stages after it be ticked."],
  ["Actual is the date it actually happened.", "A date on its own, or a date and a time: 03-02-2025 or 03-02-2025 15:22. Day first."],
  ["Planned and Time Delay are NOT imported.", "The system keeps its own planned dates from the order date and the stage offsets, and works the delay out from those. The columns are here so your sheet still looks like your sheet."],
  ["If a later stage is ticked and an earlier one is not, the earlier ones are ticked too.", "Otherwise the line could never be worked on: the board will not let anything past stock checking be ticked until stock checking is in stock. Every stage filled in this way is listed in the report."],
  ["ON HOLD is not a step in the sequence.", "It is recorded, and it never counts towards an order being complete, and it is never filled in behind a later stage."],
  ["A stage that is blank here but already ticked in the system is LEFT ALONE.", "This import never unticks anything, so it is safe to run twice and safe to run on a working day."],
];

export async function buildStatusTemplate(): Promise<Blob> {
  const wb = await workbook();
  const ws = wb.addWorksheet("Production status");

  // Row 1 — the stage names, one per four-column block. This row is what tells
  // the importer which block is which; the headings below all say the same
  // four words, so they cannot.
  const labels: Cell[] = STATUS_IDENTITY.map(() => "");
  const heads: Cell[] = [...STATUS_IDENTITY];
  for (const key of STATUS_STAGES) {
    labels.push(STAGE_LABELS[key].toUpperCase(), "", "", "");
    heads.push(...STATUS_SUB);
  }
  ws.addRow(labels);
  ws.addRow(heads);

  // Merge each block's label across its four columns, the way the real sheet
  // has it. The importer reads the first non-empty cell of the block either
  // way, so this is for the person, not the parser.
  STATUS_STAGES.forEach((_, i) => {
    const start = STATUS_IDENTITY.length + i * 4 + 1;
    ws.mergeCells(1, start, 1, start + 3);
  });

  const l = ws.getRow(1);
  l.font = { bold: true, color: { argb: INK }, size: 10 };
  l.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GROUP_FILL } };
  l.alignment = { horizontal: "center", vertical: "middle" };
  l.height = 22;

  const h = ws.getRow(2);
  h.font = { bold: true, color: { argb: INK }, size: 10 };
  h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
  h.height = 20;

  // Two sample lines of one order: the first ran to Challan, the second is
  // still sitting at stock checking and is on hold.
  const sample = (
    designNo: string,
    per: Partial<Record<StageKey, [string, string]>>,
  ): Cell[] => {
    const row: Cell[] = ["SAMPLE-1", "12-06-2026", "EXAMPLE TEXTILES", "LORDS-1", designNo, 60];
    for (const key of STATUS_STAGES) {
      const v = per[key];
      row.push("", v ? v[0] : "", v ? v[1] : "FALSE", "");
    }
    return row;
  };

  const rows = [
    sample("01", {
      order_entry: ["12-06-2026", "TRUE"],
      stock_checking: ["13-06-2026", "Yes"],
      rolling_checking: ["15-06-2026", "TRUE"],
      challan: ["16-06-2026 15:22", "TRUE"],
    }),
    sample("02", {
      order_entry: ["12-06-2026", "TRUE"],
      stock_checking: ["", "No"],
      on_hold: ["14-06-2026", "TRUE"],
    }),
  ];
  for (const r of rows) {
    const row = ws.addRow(r);
    row.font = { italic: true, color: { argb: SAMPLE_INK }, size: 10 };
  }

  ws.getColumn(STATUS_IDENTITY.indexOf("DESIGN NO") + 1).numFmt = "@";
  STATUS_IDENTITY.forEach((s, i) => (ws.getColumn(i + 1).width = Math.max(12, s.length + 4)));
  for (let c = STATUS_IDENTITY.length + 1; c <= heads.length; c++) ws.getColumn(c).width = 13;
  ws.views = [{ state: "frozen", xSplit: STATUS_IDENTITY.length, ySplit: 2 }];

  addNotes(wb, "How to fill this in", STATUS_NOTES, [
    "Order Entry rules → Import → Production status",
    "Row 1 holds the stage names. Row 2 holds the headings. Data starts on row 3.",
    "Keep the four columns per stage in the order Planned, Actual, Status, Time Delay.",
  ]);

  return blobOf(await wb.xlsx.writeBuffer());
}

// ─── shared ───────────────────────────────────────────────────────────────

function addNotes(
  wb: Awaited<ReturnType<typeof workbook>>,
  name: string,
  notes: [string, string][],
  intro: string[],
) {
  const ws = wb.addWorksheet(name);
  ws.getColumn(1).width = 62;
  ws.getColumn(2).width = 96;

  const title = ws.addRow(["How to fill this in", ""]);
  title.font = { bold: true, size: 13, color: { argb: INK } };
  ws.addRow([]);
  for (const line of intro) {
    const r = ws.addRow([line, ""]);
    r.font = { size: 10, color: { argb: SAMPLE_INK } };
  }
  ws.addRow([]);

  const head = ws.addRow(["Rule", "Why"]);
  head.font = { bold: true, size: 10, color: { argb: INK } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };

  for (const [rule, why] of notes) {
    const r = ws.addRow([rule, why]);
    r.font = { size: 10, color: { argb: INK } };
    r.alignment = { vertical: "top", wrapText: true };
  }
}

function blobOf(buf: ArrayBuffer | Buffer): Blob {
  return new Blob([buf as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Hand the finished workbook to the browser as a download. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick — revoking immediately races the download in
  // Safari and the file arrives empty.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
