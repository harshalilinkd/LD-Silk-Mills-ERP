// The production-status sheet, turned into stage ticks. Preview and write both
// call this, exactly as the orders importer does — see `build.ts`.

import { coerceDate, normaliseName } from "./coerce";
import { orderKey } from "./build";
import type { Coerced, Issue } from "./types";
import type { StatusLayout } from "./status-layout";
import {
  FLOW_STAGE_KEYS,
  STAGE_KEYS,
  STAGE_LABELS,
  computeDelayMinutes,
  isAsideStage,
  type StageKey,
} from "@/lib/order-entry/workflow-constants";

// ═══════════════════════════════════════════════════════════════════════════
//  "OK" MEANS DONE HERE, AND MEANT *NOT CANCELLED* IN THE ORDERS SHEET
// ═══════════════════════════════════════════════════════════════════════════
//
// This is the reason there are two flag vocabularies in this importer instead
// of one shared helper, and it is worth being blunt about.
//
//   orders sheet, `cancelled order` column:  OK  = the line is LIVE   (false)
//   status sheet, a stage `Status` column:   OK  = the stage is DONE  (true)
//
// The same three letters, opposite meanings, one column apart in the same
// workbook. A single shared `coerceFlag` would have to pick one, and whichever
// it picked would silently corrupt the other sheet. So each column type reads
// its own words, and anything neither list knows is REFUSED rather than
// guessed — a refusal is a line somebody looks at, a guess is not.
const STAGE_TRUE = new Set([
  "true", "yes", "y", "1", "done", "ok", "okay", "complete", "completed",
  "finished", "x", "✓", "✔",
]);
const STAGE_FALSE = new Set([
  "false", "no", "n", "0", "", "-", "--", "pending", "open", "not done",
  "notdone", "na", "n a",
]);

export function coerceStageFlag(raw: string): Coerced<boolean> {
  const s = raw.trim().toLowerCase();
  if (STAGE_FALSE.has(s)) return { ok: true, value: false };
  if (STAGE_TRUE.has(s)) return { ok: true, value: true };
  return { ok: false, reason: `"${raw.trim()}" is not a done or a not-done` };
}

/**
 * A stage timestamp: a date, optionally with a time after it.
 *
 * `coerceDate` is anchored and reads a date and nothing else, which is right
 * for an order date. The status sheet writes both `03-02-2025` and
 * `03-02-2025 15:22` in the SAME column, so the time is split off first and the
 * date half handed to the parser that already knows every way this business
 * writes a date. Built in UTC to match `plannedAtForOffset`, which is what the
 * delay is measured against.
 */
export function coerceTimestamp(raw: string): Coerced<string> {
  const s = raw.trim();
  if (!s) return { ok: true, value: null };

  const m = /^(.*?)[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(s);
  const datePart = m ? m[1].trim() : s;
  const res = coerceDate(datePart);
  if (!res.ok) return res;
  if (res.value == null) return { ok: true, value: null };

  if (!m) return { ok: true, value: `${res.value}T00:00:00.000Z`, note: res.note };

  const hh = Number(m[2]);
  const mi = Number(m[3]);
  const ss = m[4] ? Number(m[4]) : 0;
  if (hh > 23 || mi > 59 || ss > 59)
    return { ok: false, reason: `"${s}" has no such time of day` };
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    ok: true,
    value: `${res.value}T${p(hh)}:${p(mi)}:${p(ss)}.000Z`,
    note: res.note,
  };
}

// ─── what the sheet is matched against ────────────────────────────────────

/** One line already in the system, with the stage rows it already has. */
export type ExistingLine = {
  id: string;
  orderNo: string;
  quality: string;
  designNo: string;
  qtyMtr: string;
  /** The order's own date and party, so a number collision can be caught. */
  orderDate: string;
  partyName: string;
  stages: Record<string, { plannedAt: string | null; isDone: boolean }>;
};

/**
 * How a sheet row finds its line.
 *
 * ── NOT ON QUANTITY, AND THAT IS NOT AN OVERSIGHT ────────────────────────
 *
 * `lineMatchKey` in `workflow.ts` keys on quality + design + QUANTITY, which is
 * right for the order form where the quantity is a number somebody typed into
 * a number field. The status sheet's `MTR-YARD` column is not that: it holds
 * `190`, but also `2-SET` and `1-BALE`. Keying on it would fail to match every
 * row measured in bales — silently, since a row that matches nothing just
 * reports as unmatched among many.
 *
 * So the key is order + fabric + design, and the quantity is CHECKED instead:
 * a mismatch is reported on the row rather than being allowed to hide it.
 */
export function statusLineKey(
  orderNo: string,
  quality: string,
  designNo: string,
): string {
  return [orderKey(orderNo), normaliseName(quality), normaliseName(designNo)].join(
    "|",
  );
}

export function indexExistingLines(lines: ExistingLine[]): {
  byKey: Map<string, ExistingLine>;
  ambiguous: Set<string>;
} {
  const byKey = new Map<string, ExistingLine>();
  const ambiguous = new Set<string>();
  for (const l of lines) {
    const k = statusLineKey(l.orderNo, l.quality, l.designNo);
    if (byKey.has(k)) ambiguous.add(k);
    byKey.set(k, l);
  }
  return { byKey, ambiguous };
}

// ─── the plan ─────────────────────────────────────────────────────────────

export type PlannedStage = {
  stageKey: StageKey;
  isDone: boolean;
  actualAt: string | null;
  stockStatus: string | null;
  delayMinutes: number | null;
  /** `sheet` = the sheet ticked it. `backfill` = we ticked it, see below. */
  source: "sheet" | "backfill";
  /** False when the row is left exactly as the database already has it. */
  write: boolean;
};

export type PlannedLineStatus = {
  verdict: "update" | "nothing" | "error";
  line: number;
  orderNo: string;
  quality: string;
  designNo: string;
  lineId: string | null;
  stages: PlannedStage[];
  issues: Issue[];
};

export type StatusPlan = {
  rows: PlannedLineStatus[];
  fileIssues: Issue[];
  counts: {
    sourceRows: number;
    considered: number;
    matched: number;
    unmatched: number;
    errors: number;
    warnings: number;
    stagesToTick: number;
    stagesBackfilled: number;
    stagesLeftAlone: number;
  };
};

export type StatusColumnMap = {
  order_no: number | null;
  quality: number | null;
  design_no: number | null;
  qty_mtr: number | null;
  // ── THE IDENTITY CHECK, AND WHY IT IS NOT OPTIONAL IN PRACTICE ────────
  //
  // The old sheet's order numbers OVERLAP the new system's. The new book runs
  // 148-1305; the old sheet has 50, 321, 478, 2726. So the orders import
  // SKIPS an old order whose number is already taken — correctly, that is the
  // owner's choice — and the old order never enters the system at all.
  //
  // The status pass then looks up that same number and finds the NEW order
  // wearing it. Match on order + fabric + design alone and a 2024 production
  // status can be written onto an order raised in August 2026, silently, if
  // the fabric and design happen to coincide. Nothing would ever report it.
  //
  // So the sheet's own OD DATE and PARTY NAME are read and CHECKED against
  // the order that was found. A different date is a different order and the
  // row is refused; a different party is a warning, because a party gets
  // respelt far more often than a date changes.
  party_name: number | null;
  order_date: number | null;
};

export type StatusBuildInput = {
  raw: string[][];
  layout: StatusLayout;
  map: StatusColumnMap;
  lines: ExistingLine[];
};

/**
 * One row of the sheet that actually says something, with the merged cells
 * above it already resolved.
 *
 * ── WHY THIS EXISTS, AND WHAT IT DOES NOT WEAKEN ─────────────────────────
 *
 * The orders route re-reads the raw cells server-side so the preview can never
 * promise what the write does not do. The status sheet cannot be posted whole:
 * it is 21,310 rows by 44 columns, and 21,266 of those rows are array-formula
 * spill carrying the word FALSE. That is far past the 4.5 MB body limit, and
 * sending it would be sending almost nothing but noise.
 *
 * So the browser collects first: it drops the rows with no design number and
 * resolves the merged order number and fabric, then posts only what is left.
 * The part that is skipped server-side is pure text handling with no reference
 * to the database. Everything that could go stale between preview and write —
 * which line each row matches, which stages are already ticked, what the
 * planned dates are — is still read fresh in the request and re-decided there.
 */
export type CollectedRow = {
  /** 1-based line as the person sees it in Sheets. */
  line: number;
  orderNo: string;
  quality: string;
  designNo: string;
  cells: string[];
};

const cell = (row: string[] | undefined, i: number | null): string =>
  i == null || !row ? "" : (row[i] ?? "");

export function collectStatusRows(
  raw: string[][],
  layout: StatusLayout,
  map: StatusColumnMap,
): { rows: CollectedRow[]; blankRows: number; sourceRows: number } {
  const rows: CollectedRow[] = [];
  let carriedOrder = "";
  let carriedQuality = "";
  let blankRows = 0;

  for (let r = layout.headerRow + 1; r < raw.length; r++) {
    const row = raw[r];
    const orderRaw = cell(row, map.order_no).trim();
    const qualityRaw = cell(row, map.quality).trim();
    const designNo = cell(row, map.design_no).trim();

    // A new order ends the fabric carry: the last fabric of the order above is
    // not the first fabric of this one.
    if (orderRaw && orderRaw !== carriedOrder) {
      carriedOrder = orderRaw;
      carriedQuality = qualityRaw;
    } else if (qualityRaw) {
      carriedQuality = qualityRaw;
    }

    // ── THE ROWS THAT ARE ONLY A FORMULA ────────────────────────────────
    //
    // This sheet is 21,310 rows long and 38 of them hold data. The rest are
    // spill from the array formulas that build it: thousands carry the single
    // word FALSE in every Status column and nothing else, and a dozen carry
    // `OK` with no order, fabric or design at all. Reporting each of those
    // would bury the real problems under twenty thousand identical lines, so
    // they are counted and said once.
    if (!designNo) {
      blankRows++;
      continue;
    }
    rows.push({
      line: r + 1,
      orderNo: carriedOrder,
      quality: carriedQuality,
      designNo,
      cells: row ?? [],
    });
  }
  return { rows, blankRows, sourceRows: Math.max(0, raw.length - layout.headerRow - 1) };
}

export function buildStatusPlan(input: StatusBuildInput): StatusPlan {
  const c = collectStatusRows(input.raw, input.layout, input.map);
  return planStatusRows({
    rows: c.rows,
    blankRows: c.blankRows,
    sourceRows: c.sourceRows,
    layout: input.layout,
    map: input.map,
    lines: input.lines,
  });
}

export function planStatusRows(input: {
  rows: CollectedRow[];
  blankRows?: number;
  sourceRows?: number;
  layout: StatusLayout;
  map: StatusColumnMap;
  lines: ExistingLine[];
}): StatusPlan {
  const { layout, map } = input;
  const blankRows = input.blankRows ?? 0;
  const { byKey, ambiguous } = indexExistingLines(input.lines);

  const fileIssues: Issue[] = [];
  const out: PlannedLineStatus[] = [];

  for (const label of layout.unmatched)
    fileIssues.push({
      level: "warn",
      line: (layout.labelRow ?? layout.headerRow) + 1,
      message: `"${label}" is a stage this system does not have, so that whole block of columns is NOT imported.`,
    });
  for (const k of layout.missing)
    fileIssues.push({
      level: "warn",
      line: layout.headerRow + 1,
      message: `The sheet has no columns for "${STAGE_LABELS[k]}" — those stage rows are left untouched.`,
    });

  // Only the blocks that are OURS, in the order the workflow runs them, because
  // the backfill below walks that order and nothing else would be meaningful.
  const blockFor = new Map<StageKey, (typeof layout.blocks)[number]>();
  for (const b of layout.blocks) if (b.stageKey) blockFor.set(b.stageKey, b);

  let counted = 0;
  let matched = 0;
  let unmatched = 0;
  let stagesToTick = 0;
  let stagesBackfilled = 0;
  let stagesLeftAlone = 0;

  for (const collected of input.rows) {
    const { line, orderNo, quality, designNo } = collected;
    const row = collected.cells;
    counted++;
    const issues: Issue[] = [];

    if (!orderNo) {
      issues.push({
        level: "error",
        line,
        message: "This row has a design but no order number above it to attach it to.",
      });
      out.push({ verdict: "error", line, orderNo: "", quality, designNo, lineId: null, stages: [], issues });
      unmatched++;
      continue;
    }

    const key = statusLineKey(orderNo, quality, designNo);
    if (ambiguous.has(key)) {
      issues.push({
        level: "error",
        line,
        message: `Order ${orderNo} has more than one line for ${quality} / ${designNo}, so this status cannot be attached to one of them without guessing.`,
      });
      out.push({ verdict: "error", line, orderNo, quality, designNo, lineId: null, stages: [], issues });
      unmatched++;
      continue;
    }

    const existing = byKey.get(key);
    if (!existing) {
      issues.push({
        level: "error",
        line,
        message: `No line in the system for order ${orderNo}, ${quality || "(no fabric)"} / ${designNo}. Import the orders sheet first, or check the fabric spelling matches.`,
      });
      out.push({ verdict: "error", line, orderNo, quality, designNo, lineId: null, stages: [], issues });
      unmatched++;
      continue;
    }
    matched++;

    // ── IS THIS THE SAME ORDER, OR JUST THE SAME NUMBER? ────────────────
    //
    // See the note on StatusColumnMap. The order numbers overlap, so finding
    // an order with the right number proves nothing on its own.
    const sheetDateRaw = cell(row, map.order_date).trim();
    if (sheetDateRaw) {
      const d = coerceDate(sheetDateRaw);
      if (d.ok && d.value && d.value !== existing.orderDate.slice(0, 10)) {
        issues.push({
          level: "error",
          line,
          message:
            `Order ${orderNo} in this sheet is dated ${d.value}, but order ${orderNo} in the system is dated ${existing.orderDate.slice(0, 10)}` +
            ` (${existing.partyName}). Same number, different order — refused rather than written onto the wrong one.`,
        });
        out.push({ verdict: "error", line, orderNo, quality, designNo, lineId: null, stages: [], issues });
        unmatched++;
        matched--;
        continue;
      }
    }
    const sheetParty = cell(row, map.party_name).trim();
    if (
      sheetParty &&
      normaliseName(sheetParty) &&
      normaliseName(sheetParty) !== normaliseName(existing.partyName)
    ) {
      issues.push({
        level: "warn",
        line,
        message: `Party here is "${sheetParty}" but order ${orderNo} in the system is "${existing.partyName}". The dates agree, so this is taken as the same order spelt differently — check it if the order matters.`,
      });
    }

    const qtyRaw = cell(row, map.qty_mtr).trim();
    // ── ONLY COMPARE A QUANTITY THAT IS ONE ─────────────────────────────
    //
    // `MTR-YARD` holds `190`, and it also holds `2-SET` and `1-BALE`. Stripping
    // the letters out of those gives 2 and 1, which then "disagree" with the
    // 60 and 190 metres on the line and warn about it — on most rows of some
    // orders, for a cell that was never a metre figure. A unit-coded value is
    // not a quantity that can be checked, so it is not checked.
    if (/^[0-9][0-9,]*(\.[0-9]+)?$/.test(qtyRaw)) {
      const sheetQty = Number(qtyRaw.replace(/,/g, ""));
      const dbQty = Number(existing.qtyMtr);
      if (Number.isFinite(sheetQty) && sheetQty > 0 && Math.abs(sheetQty - dbQty) > 0.005)
        issues.push({
          level: "warn",
          line,
          message: `Quantity here is ${qtyRaw} but the line in the system is ${dbQty}. The status is still applied — the line was matched on order, fabric and design.`,
        });
    }

    // ── read every stage the sheet has a column for ─────────────────────
    type Read = { done: boolean | null; actual: string | null; sawNo: boolean };
    const read = new Map<StageKey, Read>();
    let bad = false;

    for (const stageKey of STAGE_KEYS) {
      const b = blockFor.get(stageKey);
      if (!b) {
        read.set(stageKey, { done: null, actual: null, sawNo: false });
        continue;
      }
      const rawStatus = cell(row, b.statusCol);
      const f = coerceStageFlag(rawStatus);
      if (!f.ok) {
        issues.push({
          level: "error",
          line,
          field: stageKey,
          message: `${STAGE_LABELS[stageKey]}: ${f.reason}`,
        });
        bad = true;
        continue;
      }
      const a = coerceTimestamp(cell(row, b.actualCol));
      if (!a.ok) {
        issues.push({
          level: "error",
          line,
          field: stageKey,
          message: `${STAGE_LABELS[stageKey]} actual: ${a.reason}`,
        });
        bad = true;
        continue;
      }
      if (a.note)
        issues.push({ level: "warn", line, field: stageKey, message: `${STAGE_LABELS[stageKey]} actual: ${a.note}` });
      read.set(stageKey, {
        done: f.value ?? false,
        actual: a.value,
        sawNo: f.value === false && rawStatus.trim() !== "",
      });
    }

    if (bad) {
      out.push({ verdict: "error", line, orderNo, quality, designNo, lineId: existing.id, stages: [], issues });
      continue;
    }

    // ── THE BACKFILL ────────────────────────────────────────────────────
    //
    // The owner chose this: when a later stage is ticked and an earlier one is
    // not, the earlier ones are ticked too. The sheet has lines with CHALLAN
    // done and STOCK CHECKING blank, which this system's own rules say cannot
    // happen — `applyStageProgress` refuses to tick anything past stock
    // checking until stock checking is in stock, so such a line would import
    // and then be impossible to work with on the board.
    //
    // A backfilled tick takes the sheet's own Actual for that stage if it has
    // one, and otherwise NOTHING. Inventing a timestamp would put a made-up
    // date into delay figures that people read as fact.
    // ── THE HOLD IS NOT PART OF THIS WALK ───────────────────────────────
    //
    // The backfill ticks everything up to the furthest tick, which is only
    // meaningful for a SEQUENCE. `on_hold` is an aside: a line held after
    // stock checking says nothing about whether it was rolled, and a line that
    // reached Challan says nothing about whether it was ever held. Counted in
    // this walk it would do both kinds of damage — a held line would backfill
    // every stage before the hold, and a dispatched line would be recorded as
    // having been held when it never was.
    //
    // So the sequence decides the backfill, and the hold is taken exactly as
    // the sheet writes it: ticked if the sheet ticks it, and not otherwise.
    let lastDone = -1;
    FLOW_STAGE_KEYS.forEach((k, i) => {
      if (read.get(k)?.done) lastDone = i;
    });

    const stages: PlannedStage[] = [];
    STAGE_KEYS.forEach((stageKey) => {
      const rd = read.get(stageKey)!;
      const aside = isAsideStage(stageKey);
      const i = aside ? -1 : FLOW_STAGE_KEYS.indexOf(stageKey);
      const isDone = aside ? rd.done === true : i <= lastDone;
      const fromSheet = rd.done === true;
      const already = existing.stages[stageKey]?.isDone ?? false;

      if (!isDone) {
        // ── NEVER UNTICK ──────────────────────────────────────────────
        //
        // The sheet is half a financial year old. If somebody has since ticked
        // a stage in the new system, a blank in the sheet is the sheet being
        // out of date, not an instruction to undo their work. Nothing here
        // ever clears a tick, which is also what makes the file safe to run
        // twice.
        if (already)
          issues.push({
            level: "note",
            line,
            field: stageKey,
            message: `${STAGE_LABELS[stageKey]} is blank in the sheet but already ticked in the system — left as it is, not unticked.`,
          });
        if (already) stagesLeftAlone++;
        return;
      }

      if (already) {
        stagesLeftAlone++;
        stages.push({
          stageKey,
          isDone: true,
          actualAt: null,
          stockStatus: null,
          delayMinutes: null,
          source: fromSheet ? "sheet" : "backfill",
          write: false,
        });
        return;
      }

      if (!fromSheet) {
        stagesBackfilled++;
        issues.push({
          level: "warn",
          line,
          field: stageKey,
          message: `${STAGE_LABELS[stageKey]} is not ticked in the sheet, but "${STAGE_LABELS[FLOW_STAGE_KEYS[lastDone]]}" after it is — ticked here so the line can be worked on.${rd.actual ? "" : " No date, because the sheet has none."}`,
        });
      } else {
        stagesToTick++;
      }

      const plannedAt = existing.stages[stageKey]?.plannedAt ?? null;
      const actualAt = rd.actual;
      if (actualAt && plannedAt && actualAt < plannedAt)
        issues.push({
          level: "warn",
          line,
          field: stageKey,
          message: `${STAGE_LABELS[stageKey]} was done ${actualAt.slice(0, 10)}, before it was planned for ${plannedAt.slice(0, 10)}. Imported as it stands — the delay will read negative.`,
        });

      stages.push({
        stageKey,
        isDone: true,
        actualAt,
        // Our model has no third state: a stage that is done is a line that was
        // in stock. A sheet that says "No" and then ticks a later stage is
        // saying the goods moved, so the tick wins and the note above records
        // that we changed it.
        stockStatus: stageKey === "stock_checking" ? "in_stock" : null,
        delayMinutes:
          actualAt && plannedAt
            ? computeDelayMinutes(new Date(plannedAt), new Date(actualAt))
            : null,
        source: fromSheet ? "sheet" : "backfill",
        write: true,
      });
    });

    const willWrite = stages.some((s) => s.write);
    out.push({
      verdict: willWrite ? "update" : "nothing",
      line,
      orderNo,
      quality,
      designNo,
      lineId: existing.id,
      stages,
      issues,
    });
  }

  if (blankRows)
    fileIssues.push({
      level: "note",
      line: layout.headerRow + 1,
      message: `${blankRows.toLocaleString("en-IN")} rows carried no design number and were skipped — in this sheet those are the array-formula rows below the data.`,
    });

  const errors = out.reduce((n, r) => n + r.issues.filter((i) => i.level === "error").length, 0);
  const warnings =
    out.reduce((n, r) => n + r.issues.filter((i) => i.level === "warn").length, 0) +
    fileIssues.filter((i) => i.level === "warn").length;

  return {
    rows: out,
    fileIssues,
    counts: {
      sourceRows: input.sourceRows ?? input.rows.length,
      considered: counted,
      matched,
      unmatched,
      errors,
      warnings,
      stagesToTick,
      stagesBackfilled,
      stagesLeftAlone,
    },
  };
}

/** Every distinct order number in the file, so only those lines are fetched. */
export function orderNosInFile(
  raw: string[][],
  layout: StatusLayout,
  map: StatusColumnMap,
): string[] {
  const seen = new Set<string>();
  let carried = "";
  for (let r = layout.headerRow + 1; r < raw.length; r++) {
    const v = cell(raw[r], map.order_no).trim();
    if (v) carried = v;
    if (carried && cell(raw[r], map.design_no).trim()) seen.add(carried);
  }
  return [...seen];
}
