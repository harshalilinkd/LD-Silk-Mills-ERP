import "server-only";

import { sql as pg } from "@/db";
import {
  addGrouped,
  concentration,
  concentrationInsight,
  groupKey,
  groupNames,
  matrixFrom,
  monthDelta,
  rank,
  spread,
  trend,
  trendInsight,
} from "../analysis";
import { count, inr, inrShort, monthName, pct, qty } from "../format";
import { LAST_FLOW_STAGE_KEY } from "../../order-entry/workflow-constants";
import type { ReportDefinition, ReportParams, ReportResult, ReportRow } from "../types";
import { MAX_EXPORT_ROWS } from "../types";
import {
  CANCELLED_CAVEAT,
  distinctLineValues,
  distinctValues,
  money2,
  n,
  ORDER_FILTER_SQL,
  orderFilterArgs,
} from "./shared";

/**
 * Order line detail — one row per line, the grain everything else rolls up from.
 *
 * The widest report in the module by row count (5,857 lines over the full
 * period) and the one most likely to be taken into somebody's own pivot table,
 * which is why every dimension the line touches is carried on it: the order's
 * party, agent and transport as well as the line's own fabric and design.
 * Denormalised on purpose — a pivot cannot join.
 */

const SQL = `
  select
    o.order_no,
    o.order_date,
    o.party_name,
    o.agent,
    o.sales_person,
    o.transport,
    li.quality,
    li.design_no,
    li.qty_mtr,
    li.rate,
    li.line_total,
    li.is_cancelled,
    coalesce(ws.label, 'Not started') as stage,
    ws.stage_key as reached_key,
    -- The same quality AND design appearing more than once inside one order.
    -- Almost always a slip during entry, and every report was reproducing it
    -- silently: the order's totals are right, but a reader comparing the sheet
    -- with the order sees the same fabric twice and cannot tell whether it is a
    -- real split delivery or a mistake.
    (count(*) over (partition by li.order_id, li.quality, li.design_no) > 1) as repeated,
    li.remarks,
    o.lot_no,
    o.challan_no
  from ld_order_entry.order_line_items li
  join ld_order_entry.customer_orders o on o.id = li.order_id
  left join lateral (
    -- Only reached is used. An earlier version also selected
    -- max(stage_key), which is a MAX over TEXT and sorts stock_checking
    -- above bill — meaningless, and exactly the sort of thing that survives
    -- because nothing reads it.
    select max(w2.sort_order) filter (where p2.is_done) as reached
    from ld_order_entry.line_stage_progress p2
    join ld_order_entry.workflow_stages w2 on w2.stage_key = p2.stage_key
    where p2.order_line_item_id = li.id
  ) done on true
  left join ld_order_entry.workflow_stages ws on ws.sort_order = done.reached
  where not li.is_deleted
    and ($1::date is null or o.order_date >= $1::date)
    and ($2::date is null or o.order_date <= $2::date)
    ${ORDER_FILTER_SQL}
    and ($6::text is null or li.quality   = $6::text)
    and ($7::text is null or li.design_no = $7::text)
  order by o.order_date desc, o.order_no desc, li.quality, li.design_no, li.id
`;

type Raw = {
  order_no: string; order_date: string; party_name: string | null; agent: string | null;
  sales_person: string | null; transport: string | null; quality: string | null;
  design_no: string | null; qty_mtr: string; rate: string; line_total: string;
  is_cancelled: boolean; stage: string; reached_key: string | null; repeated: boolean; remarks: string | null;
  lot_no: string | null; challan_no: string | null;
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Completed / In process / Cancelled, for the pivot's status slicer — not a
 * new judgement, the house rule already used everywhere else a line's
 * progress is judged (`computeLineStatus` in `workflow-constants.ts`),
 * simplified to what this report's SQL actually carries: the furthest stage
 * REACHED, not every stage's own done flag, so "on hold" cannot be told
 * apart from "reached its last stage normally" here the way the live board
 * can. Cancellation is checked first because it is a separate flag, not a
 * position in the workflow.
 */
function pivotStatus(r: Pick<Raw, "is_cancelled" | "reached_key">): "Cancelled" | "Completed" | "In process" {
  if (r.is_cancelled) return "Cancelled";
  return r.reached_key === LAST_FLOW_STAGE_KEY ? "Completed" : "In process";
}

async function run(params: ReportParams): Promise<ReportResult> {
  const raw = (await pg.unsafe(SQL, [
    ...orderFilterArgs(params),
    params.quality ?? null,
    params.design ?? null,
  ])) as unknown as Raw[];

  const sliced = raw.slice(0, MAX_EXPORT_ROWS);
  const rows: ReportRow[] = sliced.map((r) => ({
    order_no: r.order_no,
    order_date: r.order_date?.slice(0, 10) ?? null,
    party_name: r.party_name,
    agent: r.agent,
    sales_person: r.sales_person,
    transport: r.transport,
    quality: r.quality,
    design_no: r.design_no,
    qty_mtr: n(r.qty_mtr),
    rate: money2(r.rate),
    line_total: money2(r.line_total),
    is_cancelled: r.is_cancelled,
    repeated: r.repeated,
    stage: r.stage,
    lot_no: r.lot_no,
    challan_no: r.challan_no,
    remarks: r.remarks,
  }));

  const live = raw.filter((r) => !r.is_cancelled);
  const cancelled = raw.filter((r) => r.is_cancelled);
  const value = live.reduce((s, r) => s + n(r.line_total), 0);
  const metres = live.reduce((s, r) => s + n(r.qty_mtr), 0);
  const cancelledValue = cancelled.reduce((s, r) => s + n(r.line_total), 0);

  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  const byMonth = new Map<string, number>();
  // ── NAMES ARE GROUPED CASE-INSENSITIVELY ─────────────────────────────
  //
  // "LONDON" and "London" are one cloth, and on the live data 28 of 585
  // fabric names are a second spelling of another. Grouping on the raw
  // string split LONDON's ₹2.01 crore across two entries, so it ranked as
  // two medium fabrics instead of the biggest one — the error hides
  // exactly the things these charts exist to surface. See `groupKey`.
  const qualityG = new Map<string, { value: number; spellings: Map<string, number> }>();
  const qtyQualityG = new Map<string, { value: number; spellings: Map<string, number> }>();
  const partyG = new Map<string, { value: number; spellings: Map<string, number> }>();
  const designG = new Map<string, { value: number; spellings: Map<string, number> }>();
  const cancelledByParty = new Map<string, { value: number; spellings: Map<string, number> }>();
  const cancelledByAgent = new Map<string, { value: number; spellings: Map<string, number> }>();
  // Every party in the file, cancelled lines included — the count the order
  // register reports. Folded the same way, or it disagrees with byParty.
  const allParties = new Set(
    raw.map((r) => groupKey((r.party_name as string | null)?.trim() || "Not recorded")),
  ).size;
  for (const r of live) {
    add(byMonth, (r.order_date ?? "").slice(0, 7), n(r.line_total));
    const fab = r.quality?.trim() || "Not recorded";
    addGrouped(qualityG, fab, n(r.line_total));
    addGrouped(qtyQualityG, fab, n(r.qty_mtr));
    // Keyed by FABRIC AND DESIGN. A design number is only unique inside its
    // own fabric, so keying on the number alone added LIO LINEN's "1" to
    // CORDRAY's "1" and reported a ₹40.2 L design that is really 213 lines
    // across 89 fabrics.
    addGrouped(designG, `${fab} · ${r.design_no?.trim() || "Not recorded"}`, n(r.line_total));
    addGrouped(partyG, r.party_name?.trim() || "Not recorded", n(r.line_total));
  }
  // Who the cancellations belong to — see the panel that uses these.
  for (const r of cancelled) {
    addGrouped(cancelledByParty, r.party_name?.trim() || "Not recorded", n(r.line_total));
    addGrouped(cancelledByAgent, r.agent?.trim() || "Not recorded", n(r.line_total));
  }
  const byQuality = groupNames(qualityG);
  const qtyByQuality = groupNames(qtyQualityG);
  const byParty = groupNames(partyG);
  const byDesign = groupNames(designG);
  byMonth.delete("");

  /** The spelling the rest of the report shows for a fabric, so the month
   * grid and the rankings cannot label the same cloth two ways. */
  const labelForKey = new Map<string, string>();
  for (const label of byQuality.keys()) labelForKey.set(groupKey(label), label);
  const qualityLabel = (raw: string) => labelForKey.get(groupKey(raw)) ?? raw;

  // ── RATE OUTLIERS: a line priced nowhere near its fabric's usual ──────
  //
  // One ULTRA PLAIN line went out at ₹1 a metre where the other sixteen
  // averaged ₹93, and four Innova lines at ₹1,700 against a usual ₹165 —
  // a slipped decimal in both directions. Small money, but they drag the
  // rate spread and the "cheapest to dearest" figure somewhere no real
  // line sits, and nothing in this report used to mention them.
  //
  // Compared against the fabric's own MEDIAN, not its mean: the mean is
  // dragged by the very outlier being looked for. Only fabrics with five
  // or more lines are judged — below that there is no "usual" to be far
  // from.
  const ratesByFabric = new Map<string, number[]>();
  for (const r of live) {
    const rate = n(r.rate);
    if (rate <= 0) continue;
    const k = groupKey(r.quality?.trim() || "Not recorded");
    const list = ratesByFabric.get(k);
    if (list) list.push(rate); else ratesByFabric.set(k, [rate]);
  }
  const medianRate = new Map<string, number>();
  for (const [k, list] of ratesByFabric) {
    if (list.length < 5) continue;
    const s = [...list].sort((a, b) => a - b);
    const m = s.length >> 1;
    medianRate.set(k, s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
  }
  const outliers = live
    .map((r) => {
      const rate = n(r.rate);
      const k = groupKey(r.quality?.trim() || "Not recorded");
      const mid = medianRate.get(k);
      if (!mid || rate <= 0) return null;
      if (rate >= mid * 0.2 && rate <= mid * 5) return null;
      return { orderNo: r.order_no, fabric: qualityLabel(r.quality?.trim() || "Not recorded"), rate, mid };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // ── THE PARETO CURVE ─────────────────────────────────────────────────
  //
  // Fixed buckets rather than one bar per fabric: 557 bars is not a chart,
  // and the question is "how few fabrics carry the book", which these five
  // answer directly. Each bar is the share of value the top N fabrics hold.
  const sortedFabricValues = [...byQuality.values()].sort((a, b) => b - a);
  const paretoTotal = sortedFabricValues.reduce((s, v) => s + v, 0);
  const shareOfTop = (nTop: number) =>
    paretoTotal > 0
      ? (sortedFabricValues.slice(0, nTop).reduce((s, v) => s + v, 0) / paretoTotal) * 100
      : 0;
  const PARETO_STEPS = [5, 10, 25, 50, 100];
  const paretoRows = PARETO_STEPS.filter((nTop) => nTop <= sortedFabricValues.length).map((nTop) => ({
    label: `Top ${nTop}`,
    value: Math.round(shareOfTop(nTop) * 10) / 10,
    display: pct(shareOfTop(nTop), 0),
    share: shareOfTop(nTop),
  }));
  // How many fabrics it actually takes to reach 80% — the sentence the
  // curve is drawn to support.
  let running = 0;
  let fabricsTo80 = 0;
  for (const v of sortedFabricValues) {
    if (running >= paretoTotal * 0.8) break;
    running += v;
    fabricsTo80++;
  }
  const paretoNote =
    sortedFabricValues.length > 0
      ? `${count(fabricsTo80)} of ${count(sortedFabricValues.length)} fabrics make up 80% of the value. Each bar is the share held by that many biggest fabrics.`
      : "No fabric value in this period.";

  // ── "REACHED" IS A RECORDING GAP BEFORE IT IS A BACKLOG ──────────────
  //
  // Nearly every order before July reads "Not started" and nearly every
  // one after it shows real progress. That is when the mill began ticking
  // stages, not six months of stalled work — but a reader who does not
  // know that sees an enormous backlog, and this column is on the sheet.
  //
  // Detected rather than hard-coded: the month the ticking starts is read
  // from the data, so the sentence stays true when the old months are
  // eventually filled in and disappears entirely once they are.
  const byMonthNotStarted = new Map<string, { total: number; notStarted: number }>();
  for (const r of live) {
    const m = (r.order_date ?? "").slice(0, 7);
    if (!m) continue;
    const g = byMonthNotStarted.get(m) ?? { total: 0, notStarted: 0 };
    g.total++;
    if (r.stage === "Not started") g.notStarted++;
    byMonthNotStarted.set(m, g);
  }
  const monthsAsc = [...byMonthNotStarted.keys()].sort();
  const darkMonths = monthsAsc.filter((m) => {
    const g = byMonthNotStarted.get(m)!;
    return g.total >= 10 && g.notStarted / g.total >= 0.9;
  });
  const litMonths = monthsAsc.filter((m) => {
    const g = byMonthNotStarted.get(m)!;
    return g.total >= 10 && g.notStarted / g.total < 0.5;
  });
  // Only worth saying when the dark months are a solid run BEFORE the lit
  // ones — that is a start date, whereas dark months scattered among lit
  // ones would be ordinary unfinished work.
  const trackingNote =
    darkMonths.length && litMonths.length && darkMonths[darkMonths.length - 1] < litMonths[0]
      ? `“Reached” is blank on almost every order before ${monthName(litMonths[0])} — ${count(darkMonths.length)} months ` +
        `where 90% or more show “Not started”, against ${pct((1 - (byMonthNotStarted.get(litMonths[0])!.notStarted / byMonthNotStarted.get(litMonths[0])!.total)) * 100, 0)} ` +
        `showing progress from ${monthName(litMonths[0])} on. That is when stage ticking began in the mill, NOT a backlog of ` +
        `stalled orders. Read the stage columns for ${monthName(litMonths[0])} onwards; before that they say only that nobody was ticking yet.`
      : null;

  const t = trend(byMonth, inrShort);
  const rateSpread = spread(live.map((r) => n(r.rate)).filter((x) => x > 0));
  const qConc = concentration([...byQuality].map(([label, v]) => ({ label, value: v })));

  const insights: string[] = [];
  const ti = trendInsight(t, "line value");
  if (ti) insights.push(ti);
  const qi = concentrationInsight(qConc, "fabrics");
  if (qi) insights.push(qi);
  if (rateSpread.median !== null) {
    insights.push(
      `Half of all lines sell between ${inr(rateSpread.p25)} and ${inr(rateSpread.p75)} a metre, around a middle of ${inr(rateSpread.median)}. ` +
        `The mean is ${inr(rateSpread.mean)} — the gap between the two is what a handful of very high-rate lines do to an average.`,
    );
  }
  if (cancelled.length) {
    insights.push(
      `${count(cancelled.length)} lines worth ${inrShort(cancelledValue)} were cancelled — ` +
        `${pct((cancelledValue / (value + cancelledValue)) * 100, 2)} of everything written.`,
    );
  }
  if (live.length) insights.push(
    `${count(byDesign.size)} fabric-and-design pairs across ${count(byQuality.size)} fabrics went to ${count(byParty.size)} customers.` +
      // The order register counts every customer who placed an order; this
      // counts the ones with a line still standing. Where they differ, say so
      // — two reports quietly printing 202 and 204 is a question nobody
      // should have to ask.
      (allParties > byParty.size
        ? ` ${count(allParties - byParty.size)} more appear in the file with every line cancelled.`
        : ""),
  );

  // ── A PRICE THAT CANNOT BE RIGHT ─────────────────────────────────────
  //
  // Named on the face of the report rather than left in the spread. These
  // are almost always a slipped decimal at entry, and the person who can
  // fix one is the person reading this.
  if (outliers.length) {
    const worst = [...outliers].sort(
      (a, b) => Math.abs(Math.log(b.rate / b.mid)) - Math.abs(Math.log(a.rate / a.mid)),
    );
    const shown = worst.slice(0, 3)
      .map((o) => `${o.fabric} on order ${o.orderNo} at ${inr(o.rate)} against a usual ${inr(o.mid)}`)
      .join("; ");
    insights.push(
      `${count(outliers.length)} ${outliers.length === 1 ? "line is" : "lines are"} priced nowhere near the rest of ` +
        `${outliers.length === 1 ? "its" : "their"} own fabric — ${shown}` +
        `${worst.length > 3 ? ", and others" : ""}. Worth checking for a slipped decimal; they pull the rate range above.`,
    );
  }

  // Only worth a sentence when it is actually happening. The count is of
  // fabrics whose name is written more than one way, which is a data-entry
  // fact the reader can act on, not a defect in this file.
  const multiSpelled = [...qualityG.values()].filter((g) => g.spellings.size > 1).length;
  if (multiSpelled > 0) {
    insights.push(
      `${count(multiSpelled)} fabric ${multiSpelled === 1 ? "name is" : "names are"} typed more than one way in the ` +
        `source (“LONDON” and “London”). They are added together here, under the spelling that carries the most value — ` +
        `the Data sheet still shows exactly what was typed.`,
    );
  }

  return {
    rows,
    totalRows: raw.length,
    analysis: {
      headline: raw.length
        ? `${count(live.length)} lines worth ${inrShort(value)} — ${count(byDesign.size)} fabric-and-design pairs across ${count(byQuality.size)} fabrics.`
        : "No lines in this period.",
      kpis: [
        { label: "Line value", value: inrShort(value), sub: "cancelled left out", deltaPct: monthDelta(byMonth) },
        {
          label: "All lines written",
          value: inrShort(value + cancelledValue),
          sub: "including cancelled — matches the sheet's Total row",
        },
        { label: "Lines", value: count(live.length), tone: "good", sub: `${count(cancelled.length)} cancelled` },
        { label: "Metres", value: qty(Math.round(metres)), sub: "cancelled left out" },
        { label: "Average rate", value: metres > 0 ? inr(value / metres) : "—", sub: "per metre" },
        { label: "Fabrics", value: count(byQuality.size) },
        { label: "Fabric-and-design pairs", value: count(byDesign.size), sub: "a design number only means something inside its own fabric" },
        { label: "Middle rate per line", value: inr(rateSpread.median), sub: "half the lines are above, half below" },
        { label: "Cheapest to dearest", value: `${inr(rateSpread.min)} – ${inr(rateSpread.max)}`, tone: "warn", sub: "per metre" },
      ],
      trend: {
        title: "How much was sold each month",
        valueLabel: "Line value",
        points: t.points,
        averageLabel: "Average month in this period",
      },
      matrix: matrixFrom(
        live.map((r) => ({
          // Grouped by the folded name, labelled by the heaviest spelling,
          // so the grid agrees with the rankings beside it. Ungrouped, the
          // grid showed LONDON and London as two separate rows.
          label: qualityLabel(r.quality?.trim() || "Not recorded"),
          month: (r.order_date ?? "").slice(0, 7),
          value: n(r.line_total),
        })),
        {
          title: "Which fabric sold, and when",
          format: "money",
          display: inrShort,
          // Was capped at the house default of 8 — a fifth of the fabrics
          // this report tracks (some periods carry 200+). Raised so the
          // grid on the Dashboard page itself carries most of the book,
          // not just a taste of it; the Data sheet still has every fabric.
          limit: 40,
        },
      ),
      panels: [
        {
          title: "Which fabric earns most",
          valueLabel: "Value",
          rows: rank(
            [...byQuality].map(([label, v]) => ({
              label,
              value: v,
              meta: `${qty(Math.round(qtyByQuality.get(label) ?? 0))} m`,
            })),
            inrShort,
          ),
        },
        {
          // ── A PARETO, NOT A FOUR-SLICE DOUGHNUT ──────────────────────
          //
          // This was "top 4 fabrics vs everyone else". With 557 fabrics
          // that lumped 553 of them into one grey blob, which says only
          // "the rest exist". The question underneath is how CONCENTRATED
          // the book is, and the honest shape for that is the running
          // total: 119 fabrics make 80% of the value here, and a reader
          // can see the curve flatten. Fixed categories, so it draws the
          // same way in every period.
          title: "How concentrated the fabric book is",
          valueLabel: "Share of value",
          fixedCategories: true,
          rows: paretoRows,
          note: paretoNote,
        },
        {
          // ── WHO THE CANCELLATIONS BELONG TO ──────────────────────────
          //
          // Replaces "which designs earn most", where all ten rows were
          // the same fabric (LIO LINEN dominates, and a design number only
          // means something inside its own fabric) — ten bars saying one
          // thing the fabric chart above already said.
          //
          // Cancellations had one figure on this report — a KPI saying
          // they are 0.4% of everything — and no way to see whether that
          // is spread thin or is one customer. The pairs are still on the
          // Data sheet and in the pivot for anyone who wants them.
          title: "Whose orders get cancelled",
          valueLabel: "Cancelled value",
          rows: rank(
            [...groupNames(cancelledByParty)].map(([label, v]) => ({ label, value: v })),
            inrShort,
          ),
          note: "Cancelled line value by customer. A name here is not a complaint — it is where to look first if the cancellation rate moves.",
        },
        { title: "Which fabric moves most metres", valueLabel: "Metres", rows: rank([...qtyByQuality].map(([label, v]) => ({ label, value: v })), (x) => qty(Math.round(x))) },
      ],
      insights,
      caveats: [
        CANCELLED_CAVEAT,
        "Cancelled lines ARE included as rows, flagged in their own column, so the file is a complete record of what was written. That is why the Total row on the Data sheet adds to more than the Line value above — the dashboard shows both figures.",
        ...(raw.length > MAX_EXPORT_ROWS
          ? [`Only the first ${count(MAX_EXPORT_ROWS)} of ${count(raw.length)} lines are in the Data sheet. The figures above cover all of them.`]
          : []),
        ...(trackingNote ? [trackingNote] : []),
        "Fabric names that differ only in capitalisation are added together on the charts above — “LONDON” and “London” are one cloth. The Data sheet and the pivots show what was actually typed, so the two can look different and both be right.",
        "On the “Pivot - Fabric rate” sheet, “Avg rate (unweighted)” is Excel's plain average of the line rates — it counts a 6-metre line the same as a 6,000-metre one. The rate this report quotes everywhere else is WEIGHTED by metres, and you get it from the same sheet by dividing Sum of value by Sum of metres, at any level including the subtotals.",
      ],
      // Real Excel PivotTables + Slicers, on their own sheets — every
      // fabric and every party, filterable by status/agent/sales
      // person/year/month, not just the Dashboard's top-40 heat grid.
      // See `xlsx-pivot.ts` for how these are built safely.
      pivots: {
        extraFields: [
          { name: "Status", values: sliced.map((r) => pivotStatus(r)) },
          { name: "Year", values: sliced.map((r) => (r.order_date ? r.order_date.slice(0, 4) : null)) },
          {
            name: "Month",
            values: sliced.map((r) => {
              if (!r.order_date) return null;
              const m = Number(r.order_date.slice(5, 7));
              return Number.isInteger(m) && m >= 1 && m <= 12
                ? `${MONTH_NAMES[m - 1]} ${r.order_date.slice(0, 4)}`
                : null;
            }),
          },
        ],
        tables: [
          {
            // Party, then the fabrics under it — nested down the ROWS, not
            // fabrics down and parties across. The across version was built
            // first and was wrong to read: 223 columns wide, so any two
            // parties a manager wanted to compare were several screens
            // apart and most cells were blank. Nested rows give one line per
            // party-and-fabric with a subtotal per party, which is the shape
            // somebody actually reads down.
            rowFields: ["party_name", "quality"],
            dataFields: [{ field: "line_total", label: "Sum of line value" }],
            slicerFields: ["Status", "Year", "Month"],
            sheetName: "Pivot - Fabric",
            pivotTableName: "PartyAndFabric",
          },
          {
            // Who bought it: one row per party, metres and value side by
            // side, sliceable by agent and sales person as well as status
            // and period — the commercial rollup, not the production one.
            rowFields: ["party_name"],
            dataFields: [
              { field: "qty_mtr", label: "Sum of metres" },
              { field: "line_total", label: "Sum of value" },
            ],
            slicerFields: ["agent", "sales_person", "Status", "Year", "Month"],
            sheetName: "Pivot - Party",
            pivotTableName: "PartyRollup",
          },
          {
            // Fabric, quantity and rate — the cloth view.
            //
            // ── WHY THREE COLUMNS FOR "QTY AND RATE" ──────────────────────
            //
            // The rate that matters is WEIGHTED: total value over total
            // metres, so a 6,000-metre line counts more than a 6-metre one
            // (the same rule `ReportColumn.avgWeightBy` sets on the Rate
            // column itself). Excel can only express that as a calculated
            // field, and this Excel refuses to create one — so rather than
            // ship a single "Rate" column that is quietly the wrong
            // average, both ingredients are here: metres and value, whose
            // ratio IS the weighted rate at every level including the
            // subtotals. The third column is Excel's plain mean of the line
            // rates, named so nobody mistakes it for the weighted one.
            rowFields: ["quality"],
            dataFields: [
              { field: "qty_mtr", label: "Sum of metres" },
              { field: "line_total", label: "Sum of value" },
              { field: "rate", aggregate: "average", label: "Avg rate (unweighted)" },
            ],
            slicerFields: ["Status", "Year", "Month", "party_name"],
            sheetName: "Pivot - Fabric rate",
            pivotTableName: "FabricRate",
          },
        ],
      },
    },
  };
}

export const lineDetail: ReportDefinition = {
  id: "order-entry.line-detail",
  module: "order-entry",
  title: "Order line detail",
  description:
    "Every line of every order — fabric, design, metres, rate and value, with the order's party, agent and transport carried alongside so it pivots without a join.",
  defaultMonthsBack: 2,
  columns: [
    { key: "order_no", label: "Order no", type: "text", width: 14 },
    { key: "order_date", label: "Order date", type: "date" },
    { key: "party_name", label: "Party", type: "text", width: 30 },
    { key: "agent", label: "Agent", type: "text", width: 22 },
    { key: "sales_person", label: "Sales person", type: "text", width: 17 },
    { key: "transport", label: "Transport", type: "text", width: 22 },
    { key: "quality", label: "Fabric", type: "text", width: 26 },
    { key: "design_no", label: "Design no", type: "text", width: 16 },
    { key: "qty_mtr", label: "Metres", type: "number", unit: "MTR" },
    { key: "rate", label: "Rate", type: "money", total: "avg", avgWeightBy: "qty_mtr", note: "Rupees a metre. The foot is weighted by metres, not a plain average of the rates — and it covers EVERY row in this sheet including the cancelled ones, so it differs slightly from the dashboard's Average rate, which is live lines only." },
    { key: "line_total", label: "Line value", type: "money" },
    { key: "is_cancelled", label: "Cancelled", type: "boolean",
      // The house example of why a badge is never inferred from the type:
      // "Cancelled: Yes" is bad where "Received: Yes" is good, and only the
      // column knows which.
      badge: { Yes: "bad" },
      note: "Cancelled lines are listed but excluded from every total above." },
    { key: "repeated", label: "Listed twice", type: "boolean",
      // Allowed, but worth a look — two rates or two lots, or a slip.
      badge: { Yes: "warn" },
      note: "The same fabric and design appears more than once on this order. Every member of the pair is flagged here, so a pair shows as two rows — the order register counts the EXTRA lines instead, so the same 29 repeats read as 29 there and 58 here. Allowed on purpose: two rates, or two lots." },
    { key: "stage", label: "Reached", type: "text", width: 17,
      badge: { "Not started": "warn" },
      note: "The furthest stage this LINE has finished." },
    { key: "lot_no", label: "Lot no", type: "text", width: 14 },
    { key: "challan_no", label: "Challan no", type: "text", width: 14 },
    { key: "remarks", label: "Remarks", type: "text", width: 32 },
  ],
  filters: [
    { key: "dateRange", label: "Order date", kind: "dateRange" },
    { key: "party", label: "Party", kind: "select", options: () => distinctValues("party_name") },
    { key: "agent", label: "Agent", kind: "select", options: () => distinctValues("agent") },
    { key: "salesPerson", label: "Sales person", kind: "select", options: () => distinctValues("sales_person") },
    { key: "quality", label: "Fabric", kind: "select", options: () => distinctLineValues("quality") },
    { key: "design", label: "Design no", kind: "select", options: () => distinctLineValues("design_no") },
  ],
  run,
};
