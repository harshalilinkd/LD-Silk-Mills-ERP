// Rows in, a plan out. This is the file the preview and the write BOTH call.
//
// NO SERVER IMPORTS. Everything it needs to judge a row — which order numbers
// already exist, which party names the masters know — is passed in, so the
// browser can run it for the preview and the route can run it again against
// freshly-read data before anything is written. If it ever imports the db,
// the preview stops working and the reason will not be obvious.

import { coerceDate, coerceFlag, coerceNumber, coerceText, nearestName, normaliseName } from "./coerce";
import { FIELD_BY_ID, IMPORT_FIELDS } from "./fields";
import type {
  ColumnMap,
  ImportPlan,
  Issue,
  PlannedLine,
  PlannedOrder,
  UnknownName,
} from "./types";

export type MasterLists = {
  PARTY: Map<string, string>;
  FABRIC: Map<string, string>;
  AGENT: Map<string, string>;
  SALES_PERSON: Map<string, string>;
  TRANSPORT: Map<string, string>;
  HASTE: Map<string, string>;
};

export type BuildInput = {
  rows: string[][];
  map: ColumnMap;
  /** Order numbers already in `customer_orders`, normalised by `orderKey`. */
  existingOrderNos: Set<string>;
  masters: MasterLists;
  /** Source line of `rows[0]` as the person sees it in Sheets (header = 1). */
  firstLine?: number;
};

/**
 * How an order number is COMPARED.
 *
 * `1058`, `1058 `, `#1058` and `1058.0` are one order. That last one is not
 * hypothetical: a Sheets column of numbers exported to CSV gives `1058` but an
 * XLSX cell read as a number gives `1058` only if it is an integer — a column
 * with one decimal value anywhere turns the whole column into floats.
 *
 * The STORED value stays exactly what the sheet said, so nothing is invented;
 * this form is only ever used to look for a clash.
 */
export function orderKey(raw: string): string {
  const t = raw.trim().replace(/^#/, "");
  const asNum = /^\d+\.0+$/.exec(t);
  return (asNum ? t.replace(/\.0+$/, "") : t).toLowerCase();
}

const cell = (row: string[], i: number | null | undefined): string =>
  i == null ? "" : (row[i] ?? "");

export function buildPlan(input: BuildInput): ImportPlan {
  const { rows, map, existingOrderNos, masters } = input;
  const firstLine = input.firstLine ?? 2;

  const fileIssues: Issue[] = [];
  const groups = new Map<string, { lines: number[]; raw: string[][] }>();

  /** The fields that make a row a DESIGN LINE rather than an order header. */
  const LINE_FIELDS = [
    "quality",
    "design_no",
    "qty_mtr",
    "rate",
    "is_cancelled",
    "line_remarks",
    "check_total",
  ];

  // ── pass 1: group the rows by order number ──────────────────────────────
  //
  // ── A BLANK ORDER NUMBER MEANS "THE ONE ABOVE" ─────────────────────────
  //
  // The merged-cell rule has to apply to the order NUMBER before it can apply
  // to anything else: the number is the only thing tying a row to its order,
  // so a continuation row that does not inherit it is not merely missing its
  // party — it is lost entirely.
  //
  // A person writing an order into Sheets types the number once and lists the
  // designs underneath. Exported, rows two and three of that block have an
  // empty first cell. The first version of this grouped on the raw cell and
  // dropped every one of them: a four-design order imported with one design,
  // and the report said "no order number on this row" three times, which reads
  // like a broken file rather than a completely normal one.
  //
  // It is only inherited by a row that CARRIES LINE DATA. A trailing row with
  // a stray note in it inherits nothing and is reported, because attaching
  // that to whatever came last is how a comment becomes a design.
  let lastKey: string | null = null;
  let inherited = 0;
  let firstInheritedLine = 0;

  rows.forEach((row, i) => {
    const line = firstLine + i;
    // A row where every mapped cell is empty is a spacer, not a mistake. Real
    // sheets are full of them and reporting each one buries the real errors.
    const anyValue = IMPORT_FIELDS.some((f) => cell(row, map[f.id]).trim());
    if (!anyValue) return;

    const no = cell(row, map.order_no).trim();
    let key: string;

    if (no) {
      key = orderKey(no);
      lastKey = key;
    } else {
      const hasLine = LINE_FIELDS.some((id) => cell(row, map[id]).trim());
      if (!lastKey || !hasLine) {
        fileIssues.push({
          level: "error",
          line,
          field: "order_no",
          message: lastKey
            ? "No order number, and nothing on the row that looks like a design line, so it cannot join the order above."
            : "No order number, and no order above it to belong to.",
        });
        return;
      }
      key = lastKey;
      inherited += 1;
      if (!firstInheritedLine) firstInheritedLine = line;
    }

    const g = groups.get(key) ?? { lines: [], raw: [] };
    g.lines.push(line);
    g.raw.push(row);
    groups.set(key, g);
  });

  // Said ONCE, not per row — on a real sheet this is most of the file, and a
  // note against every continuation row would bury the errors that matter.
  if (inherited > 0) {
    fileIssues.push({
      level: "note",
      line: firstInheritedLine,
      field: "order_no",
      message: `${inherited} row${inherited === 1 ? "" : "s"} carried no order number and were read as further designs for the order above — which is what a merged cell looks like once it has been exported. Check the first one if that is not what the sheet means.`,
    });
  }

  // ── pass 2: build each order ────────────────────────────────────────────
  const orders: PlannedOrder[] = [];
  const unknownSeen = new Map<string, UnknownName>();

  const noteUnknown = (
    category: UnknownName["category"],
    value: string | null,
  ) => {
    if (!value) return;
    const n = normaliseName(value);
    if (!n) return;
    const list = masters[category];
    if (list.has(n)) return;
    const k = `${category}::${n}`;
    const seen = unknownSeen.get(k);
    if (seen) {
      seen.uses += 1;
      return;
    }
    unknownSeen.set(k, {
      category,
      value,
      uses: 1,
      nearest: nearestName(value, list),
    });
  };

  for (const [key, g] of groups) {
    const issues: Issue[] = [];

    /**
     * ── A BLANK CELL BELOW A VALUE IS THE SAME VALUE ──────────────────────
     *
     * This is the single most important behaviour in the file, and it looks
     * like a bug until you have seen the source. A Google Sheet written by a
     * person puts the order number, party and date on the FIRST row of an
     * order and leaves them blank down the rest — visually it is a merged
     * cell. Exported, those cells are empty strings.
     *
     * So an order-level field takes the first non-empty value in its group.
     * Requiring every row to repeat it would reject almost every real order.
     */
    const orderValue = (fieldId: string) => {
      const idx = map[fieldId];
      const field = FIELD_BY_ID.get(fieldId)!;
      const distinct = new Map<string, number>();
      let first: { raw: string; line: number } | null = null;

      g.raw.forEach((row, i) => {
        const v = cell(row, idx).trim();
        if (!v) return;
        if (!first) first = { raw: v, line: g.lines[i] };
        const n = field.kind === "text" ? normaliseName(v) : v;
        if (!distinct.has(n)) distinct.set(n, g.lines[i]);
      });

      // Two different values for one order is a real mistake in the source and
      // the person has to see it — but it must not stop the import, or one
      // stray character costs the whole order.
      if (distinct.size > 1) {
        issues.push({
          level: "warn",
          line: first!.line,
          field: fieldId,
          message: `${field.label} is not the same on every row of this order (${[...distinct.keys()]
            .slice(0, 3)
            .map((s) => `"${s}"`)
            .join(", ")}${distinct.size > 3 ? ", …" : ""}). Using the first one.`,
        });
      }

      return first as { raw: string; line: number } | null;
    };

    const readOrderField = (fieldId: string): string | null => {
      const f = FIELD_BY_ID.get(fieldId)!;
      const found = orderValue(fieldId);
      if (!found) {
        if (f.required)
          issues.push({
            level: "error",
            line: g.lines[0],
            field: fieldId,
            message: `${f.label} is required and is empty on every row of this order.`,
          });
        return null;
      }
      const res = coerceText(found.raw, f.max);
      if (!res.ok) {
        issues.push({ level: "error", line: found.line, field: fieldId, message: `${f.label}: ${res.reason}` });
        return null;
      }
      if (res.note)
        issues.push({ level: "note", line: found.line, field: fieldId, message: `${f.label}: ${res.note}` });
      return res.value;
    };

    const orderNoRaw = orderValue("order_no");
    const orderNo = readOrderField("order_no") ?? orderNoRaw?.raw.trim() ?? key;

    // The date gets its own read — it is the one order-level field whose
    // coercion carries the ambiguity warning.
    let orderDate: string | null = null;
    {
      const found = orderValue("order_date");
      if (!found) {
        issues.push({
          level: "error",
          line: g.lines[0],
          field: "order_date",
          message: "Order date is required and is empty on every row of this order.",
        });
      } else {
        const res = coerceDate(found.raw);
        if (!res.ok) {
          issues.push({ level: "error", line: found.line, field: "order_date", message: `Order date: ${res.reason}` });
        } else {
          orderDate = res.value;
          if (res.note)
            issues.push({ level: "warn", line: found.line, field: "order_date", message: res.note });
        }
      }
    }

    const partyName = readOrderField("party_name");
    const salesPerson = readOrderField("sales_person");
    const agent = readOrderField("agent");
    const haste = readOrderField("haste");
    const transport = readOrderField("transport");
    const challanNo = readOrderField("challan_no");
    const lotNo = readOrderField("lot_no");
    const orderRemarks = readOrderField("order_remarks");
    const department = readOrderField("department");

    noteUnknown("PARTY", partyName);
    noteUnknown("AGENT", agent);
    noteUnknown("SALES_PERSON", salesPerson);
    noteUnknown("TRANSPORT", transport);
    noteUnknown("HASTE", haste);

    // ── the design lines ──────────────────────────────────────────────────
    const items: PlannedLine[] = [];
    const seenDesign = new Map<string, number>();

    // ── FABRIC IS MERGED DOWN TOO, NOT JUST THE ORDER HEADER ──────────────
    //
    // The order-level forward-fill above handles the block that starts an
    // order. It is not enough. In the old sheet the FABRIC cell is merged over
    // its own designs INSIDE an order, so one order looks like this:
    //
    //     478 | MESSI | LORDS-1 | 1 | 60      <- fabric written once
    //         |       |         | 2 | 60      <- blank: still LORDS-1
    //         |       |         | 3 | 60      <- blank: still LORDS-1
    //         |       | LORDS-2 | 1 | 60      <- a NEW fabric block
    //         |       |         | 2 | 60      <- blank: LORDS-2, not LORDS-1
    //
    // Without this, rows 2, 3 and 5 fail "Fabric is required on a design
    // line." — and since the fabric is written once per block and blank
    // everywhere else, that is MOST of the file. On the real sheet the whole
    // import came to nothing: three orders, zero lines, twenty-three errors.
    //
    // It carries only within one order. An order that opens on a blank fabric
    // is left to fail rather than inheriting the previous ORDER's fabric,
    // which would attach a design to a cloth nobody ordered.
    let carriedQuality: string | null = null;

    g.raw.forEach((row, i) => {
      const line = g.lines[i];
      // A row carrying only order-level values (the head of a merged block,
      // with the designs starting underneath) is not a design line.
      if (!LINE_FIELDS.some((id) => cell(row, map[id]).trim())) return;

      const readLine = (fieldId: string) => {
        const f = FIELD_BY_ID.get(fieldId)!;
        const raw = cell(row, map[fieldId]);
        switch (f.kind) {
          case "number":
            return coerceNumber(raw);
          case "flag":
            return coerceFlag(raw);
          case "date":
            return coerceDate(raw);
          default:
            return coerceText(raw, f.max);
        }
      };

      const push = (fieldId: string, res: ReturnType<typeof readLine>) => {
        const f = FIELD_BY_ID.get(fieldId)!;
        if (!res.ok) {
          issues.push({ level: "error", line, field: fieldId, message: `${f.label}: ${res.reason}` });
          return null;
        }
        if (res.note)
          issues.push({ level: "note", line, field: fieldId, message: `${f.label}: ${res.note}` });
        return res.value;
      };

      let quality = push("quality", readLine("quality")) as string | null;
      if (quality) {
        carriedQuality = quality;
      } else if (carriedQuality && !cell(row, map["quality"]).trim()) {
        // Blank, not unreadable — an unreadable fabric already reported its own
        // error above and must not be papered over with the one above it.
        quality = carriedQuality;
        issues.push({
          level: "note",
          line,
          field: "quality",
          message: `Fabric: blank, taken as "${carriedQuality}" from the row above.`,
        });
      }
      const designNo = push("design_no", readLine("design_no")) as string | null;
      const qty = push("qty_mtr", readLine("qty_mtr")) as number | null;
      const rate = push("rate", readLine("rate")) as number | null;
      const cancelled = push("is_cancelled", readLine("is_cancelled")) as boolean | null;
      const lineRemarks = push("line_remarks", readLine("line_remarks")) as string | null;
      const checkTotal = push("check_total", readLine("check_total")) as number | null;

      let bad = false;
      if (!quality) {
        issues.push({ level: "error", line, field: "quality", message: "Fabric is required on a design line." });
        bad = true;
      }
      if (!designNo) {
        issues.push({ level: "error", line, field: "design_no", message: "Design no is required on a design line." });
        bad = true;
      }
      if (qty == null) {
        issues.push({ level: "error", line, field: "qty_mtr", message: "Qty is required on a design line." });
        bad = true;
      } else if (qty <= 0) {
        issues.push({ level: "error", line, field: "qty_mtr", message: `Qty is ${qty}. A design line has to have a quantity.` });
        bad = true;
      } else if (qty > 99_999_999) {
        issues.push({ level: "error", line, field: "qty_mtr", message: `Qty ${qty} is larger than the column holds.` });
        bad = true;
      }
      if (rate != null && rate < 0) {
        issues.push({ level: "error", line, field: "rate", message: `Rate is ${rate}.` });
        bad = true;
      }

      // The arithmetic check — the reason `check_total` is mappable at all.
      if (!bad && checkTotal != null && qty != null && rate != null) {
        const computed = Math.round(qty * rate * 100) / 100;
        if (Math.abs(computed - checkTotal) > 1) {
          issues.push({
            level: "warn",
            line,
            field: "check_total",
            message: `The sheet says ${checkTotal} but qty x rate is ${computed}. The system will store ${computed} — the total is computed, never typed.`,
          });
        }
      }

      if (bad) return;

      noteUnknown("FABRIC", quality);

      // The same fabric and design twice in one order is a duplicate in the
      // SOURCE. Importing both silently doubles the quantity of that design.
      const dk = `${normaliseName(quality!)}__${normaliseName(designNo!)}`;
      const before = seenDesign.get(dk);
      if (before != null) {
        issues.push({
          level: "warn",
          line,
          field: "design_no",
          message: `${quality} / ${designNo} is already on line ${before} of this order. Both will be imported — check the sheet if that is not intended.`,
        });
      } else {
        seenDesign.set(dk, line);
      }

      items.push({
        line,
        quality: quality!,
        designNo: designNo!,
        qtyMtr: qty!,
        rate,
        isCancelled: cancelled ?? false,
        remarks: lineRemarks,
      });
    });

    if (items.length === 0) {
      issues.push({
        level: "error",
        line: g.lines[0],
        message: "This order has no design line with a fabric, design no and quantity.",
      });
    }

    // ── the verdict ───────────────────────────────────────────────────────
    const hasError = issues.some((i) => i.level === "error");
    const already = existingOrderNos.has(key);

    if (already) {
      issues.push({
        level: "note",
        line: g.lines[0],
        field: "order_no",
        message: `Order ${orderNo} is already in the new system. It will be left exactly as it is — nothing here is written over it.`,
      });
    }

    orders.push({
      // A duplicate is a SKIP even when it also has errors: it is not being
      // written, so its errors are not something anybody has to go and fix.
      verdict: already ? "skip" : hasError ? "error" : "add",
      lines: g.lines,
      orderNo,
      orderDate,
      partyName: partyName ?? "",
      salesPerson,
      agent,
      haste,
      transport,
      challanNo,
      lotNo,
      department,
      remarks: orderRemarks,
      items,
      issues,
    });
  }

  // Newest first reads better in a report, but the source order is what
  // somebody scrolls their own sheet in. Keep the file's order.
  const counts = {
    sourceRows: rows.length,
    orders: orders.length,
    add: orders.filter((o) => o.verdict === "add").length,
    skip: orders.filter((o) => o.verdict === "skip").length,
    error: orders.filter((o) => o.verdict === "error").length,
    lines: orders.filter((o) => o.verdict === "add").reduce((n, o) => n + o.items.length, 0),
    errors:
      fileIssues.filter((i) => i.level === "error").length +
      orders.reduce((n, o) => n + o.issues.filter((i) => i.level === "error").length, 0),
    warnings: orders.reduce(
      (n, o) => n + o.issues.filter((i) => i.level === "warn").length,
      0,
    ),
  };

  return {
    orders,
    fileIssues,
    unknown: [...unknownSeen.values()].sort(
      (a, b) => b.uses - a.uses || a.value.localeCompare(b.value),
    ),
    counts,
  };
}
