// Finding the stage columns in the production-status sheet.
//
// ═══════════════════════════════════════════════════════════════════════════
//  WHY THIS SHEET CANNOT USE THE ORDERS IMPORTER'S MAPPING SCREEN
// ═══════════════════════════════════════════════════════════════════════════
//
// The orders sheet has one row of unique headings, so a dropdown per target
// column works: `PARTY NAME` appears once and means one thing.
//
// The status sheet does not. Its heading row is:
//
//   ... STATUS | Planned Actual Status Time Delay | Planned Actual Status ...
//
// `Planned` appears EIGHT times and `Status` NINE. The heading alone cannot say
// which stage a column belongs to — that lives one row ABOVE, in a merged cell
// spanning each four-column block:
//
//   row 2:  ORDER ENTRY |    | STOCK CHECKING |    | ON HOLD | ...
//   row 6:  Planned Actual Status Delay | Planned Actual Status Delay | ...
//
// Twenty-five hand-set dropdowns would be unusable and, worse, easy to set
// wrong by one column — which would file every dispatch date under `bill` with
// nothing on screen to show it. So the blocks are DETECTED and then shown for
// confirmation, stage by stage, with a real sample under each.
//
// ── DETECTED, THEN SHOWN. NEVER DETECTED AND APPLIED ──────────────────────
//
// Same rule as the orders mapping: the layout this returns is rendered for a
// person to check before a single cell is read.

import { normaliseName } from "./coerce";
import {
  STAGE_KEYS,
  STAGE_LABELS,
  type StageKey,
} from "@/lib/order-entry/workflow-constants";

/** One `Planned / Actual / Status / Time Delay` block found in the sheet. */
export type StageBlock = {
  /** The label read from the row above, e.g. `ROLLING & CHECKING`. */
  label: string;
  /** Our stage, or null when the sheet has a stage we do not model. */
  stageKey: StageKey | null;
  plannedCol: number;
  actualCol: number;
  statusCol: number;
  delayCol: number | null;
};

export type StatusLayout = {
  /** 0-based index into the raw rows of the real heading row. */
  headerRow: number;
  /** 0-based index of the row the stage names were read from. */
  labelRow: number | null;
  headers: string[];
  blocks: StageBlock[];
  /** Blocks whose label matched no stage of ours — reported, never guessed. */
  unmatched: string[];
  /** Our stages the sheet had no column for. */
  missing: StageKey[];
};

export class StatusLayoutError extends Error {}

/**
 * The sheet's own words for our stages.
 *
 * `ON HOLD` was absent here at first, because this system had no such stage
 * and inventing one would have written a tick nothing could read. The owner
 * asked for the stage (Sep 2026) rather than lose the column, so it maps now —
 * but as an ASIDE, never as a step. See `ASIDE_STAGE_KEYS` in
 * `workflow-constants.ts` for what that costs and why it is not negotiable,
 * and `status-build.ts` for why a hold is never backfilled.
 */
const STAGE_ALIASES: Record<string, StageKey> = {
  "on hold": "on_hold",
  hold: "on_hold",
  "on-hold": "on_hold",
  "order entry": "order_entry",
  "order sheet entry": "order_entry",
  entry: "order_entry",
  "stock checking": "stock_checking",
  "stock check": "stock_checking",
  stock: "stock_checking",
  "rolling checking": "rolling_checking",
  "rolling and checking": "rolling_checking",
  rolling: "rolling_checking",
  challan: "challan",
  chalan: "challan",
  bill: "bill",
  invoice: "bill",
  dispatch: "dispatch",
  despatch: "dispatch",
  "received lr": "received_lr",
  "receive lr": "received_lr",
  "lr received": "received_lr",
  lr: "received_lr",
};

export function stageKeyForLabel(label: string): StageKey | null {
  // `RECEIVED LR?` keeps its question mark through normalisation only as a
  // trailing space, but a sheet that writes `RECEIVED LR ?` would not — strip
  // it explicitly rather than rely on the shape of the punctuation.
  const n = normaliseName(label.replace(/\?/g, " ")).trim();
  if (!n) return null;
  if (STAGE_ALIASES[n]) return STAGE_ALIASES[n];
  for (const [alias, key] of Object.entries(STAGE_ALIASES)) {
    if (alias.length < 4) continue;
    if (n.startsWith(alias + " ") || n.endsWith(" " + alias)) return key;
  }
  return null;
}

const isWord = (cell: string, word: string) => normaliseName(cell) === word;

/**
 * The heading row is the one that repeats `Planned` and `Actual`.
 *
 * It is NOT the first non-empty row — this sheet opens with a timestamp and
 * three rows of department names and SLA text. `parseImportFile` takes the
 * first non-empty row as the heading, which here would be
 * `10-09-2026 13:35, 0.416666667, 10, 20` and produce a screen full of numbers.
 * That is why the raw rows are carried alongside the parsed sheet.
 */
function findHeaderRow(raw: string[][]): number {
  let best = -1;
  let bestScore = 0;
  const limit = Math.min(raw.length, 60);
  for (let r = 0; r < limit; r++) {
    const row = raw[r] ?? [];
    const planned = row.filter((c) => isWord(c, "planned")).length;
    const actual = row.filter((c) => isWord(c, "actual")).length;
    const status = row.filter((c) => isWord(c, "status")).length;
    if (planned < 2 || actual < 2) continue;
    const score = planned + actual + status;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

/** The first non-empty cell of a four-column block in one row. */
function blockCell(raw: string[][], row: number, start: number): string {
  for (let c = start; c < start + 4; c++) {
    const v = (raw[row]?.[c] ?? "").replace(/\s+/g, " ").trim();
    if (v) return v;
  }
  return "";
}

/**
 * Which row above the heading actually holds the stage names.
 *
 * ── "NEAREST NON-EMPTY ROW" IS THE WRONG RULE, AND THIS SHEET PROVES IT ───
 *
 * Above the heading this file stacks FOUR rows, all populated at exactly the
 * columns the stage names sit at:
 *
 *   row 2   ORDER ENTRY        STOCK CHECKING     ROLLING & CHECKING   <- names
 *   row 3   PAVAN              PAVAN-AZAM-ANIL    ROLLING DEPARTMENT   <- who
 *   row 4   ERP                ERP(1 Hour)        Azam                 <- where
 *   row 5   NEXT DAY AT 04 PM  30/12/1899 01:00   NEXT EOD BY 6 PM     <- the SLA
 *
 * Walking up from the heading and taking the first row with something in it
 * returns the SLA row, so every block is labelled `NEXT EOD` and matches no
 * stage — the importer then cheerfully reports that this system has none of
 * the stages in the sheet and imports nothing at all. That is what it did.
 *
 * So the label row is not the nearest one: it is the one whose words are
 * actually stage names. Each candidate is scored by how many blocks it names,
 * and the best wins. A sheet nobody here has seen still gets labels — the
 * nearest-row rule is kept as the fallback — but they are shown for a person to
 * read, never silently trusted.
 */
function findLabelRow(raw: string[][], headerRow: number, starts: number[]): number | null {
  let best: number | null = null;
  let bestScore = 0;
  for (let r = headerRow - 1; r >= 0 && r >= headerRow - 8; r--) {
    let score = 0;
    for (const c of starts) if (stageKeyForLabel(blockCell(raw, r, c))) score++;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  if (best !== null) return best;
  // Nothing named a stage. Fall back to the nearest row that has anything at
  // all, so the screen can show the person what it found and be told otherwise.
  for (let r = headerRow - 1; r >= 0 && r >= headerRow - 8; r--)
    if (starts.some((c) => blockCell(raw, r, c))) return r;
  return null;
}

export function detectStatusLayout(raw: string[][]): StatusLayout {
  const headerRow = findHeaderRow(raw);
  if (headerRow < 0)
    throw new StatusLayoutError(
      "No production-status layout in this sheet: it needs a heading row that repeats `Planned` and `Actual`, one pair per stage. Check you exported the status tab and not the orders tab.",
    );

  const header = raw[headerRow];
  const width = raw.reduce((w, r) => Math.max(w, r.length), 0);
  const headers: string[] = [];
  for (let i = 0; i < width; i++)
    headers.push((header[i] ?? "").replace(/\s+/g, " ").trim());

  // A block is Planned then Actual then Status. The Time Delay that follows is
  // taken only when it is there — and it is never READ, only located, so that
  // the block width is known. See `status-build.ts` for why the sheet's own
  // delay figure is recomputed rather than trusted.
  const starts: number[] = [];
  for (let c = 0; c < width; c++) {
    if (!isWord(headers[c] ?? "", "planned")) continue;
    if (!isWord(headers[c + 1] ?? "", "actual")) continue;
    if (!isWord(headers[c + 2] ?? "", "status")) continue;
    starts.push(c);
  }

  const labelRow = findLabelRow(raw, headerRow, starts);

  const blocks: StageBlock[] = [];
  const unmatched: string[] = [];
  for (const c of starts) {
    const label = labelRow === null ? "" : blockCell(raw, labelRow, c);
    const stageKey = stageKeyForLabel(label);
    if (!stageKey) unmatched.push(label || `column ${c + 1}`);
    blocks.push({
      label,
      stageKey,
      plannedCol: c,
      actualCol: c + 1,
      statusCol: c + 2,
      delayCol: normaliseName(headers[c + 3] ?? "").includes("delay") ? c + 3 : null,
    });
  }

  if (!blocks.length)
    throw new StatusLayoutError(
      "Found the heading row but no `Planned / Actual / Status` blocks under it. The stage columns have to come in that order.",
    );

  // A stage claimed twice is a layout we must not guess at.
  const seen = new Map<StageKey, string>();
  for (const b of blocks) {
    if (!b.stageKey) continue;
    const prev = seen.get(b.stageKey);
    if (prev)
      throw new StatusLayoutError(
        `Two column blocks both read as "${STAGE_LABELS[b.stageKey]}" — "${prev}" and "${b.label}". Rename one in the sheet so it is clear which is which.`,
      );
    seen.set(b.stageKey, b.label);
  }

  const missing = STAGE_KEYS.filter((k) => !seen.has(k));
  return { headerRow, labelRow, headers, blocks, unmatched, missing };
}
