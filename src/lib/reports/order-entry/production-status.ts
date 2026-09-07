import "server-only";

import { sql as pg } from "@/db";
import { rank, spread } from "../analysis";
import { count, inrShort, pct } from "../format";
import type { Panel, ReportDefinition, ReportParams, ReportResult, ReportRow } from "../types";
import { MAX_EXPORT_ROWS } from "../types";
import {
  RECORDED_CAVEAT,
  STAGES,
  distinctValues,
  money2,
  n,
  ORDER_FILTER_SQL,
  orderFilterArgs,
} from "./shared";

/**
 * Production status — every line against all seven stages.
 *
 * ── THE FUNNEL IS THE POINT ──────────────────────────────────────────────
 *
 * 4,736 lines have finished Order Entry and 2,080 have finished Received LR.
 * That fall is the single most useful shape in the module and no screen draws
 * it: it says where work accumulates. The report carries it as a panel and
 * the per-stage columns let anybody rebuild it themselves.
 *
 * ── AND WHY EVERY DATE COLUMN SAYS "TICKED", NOT "DONE" ──────────────────
 *
 * See `RECORDED_CAVEAT` in `shared.ts`. In short: these timestamps record when
 * somebody pressed a button, and a great many were pressed in bulk. The
 * columns are named for what they actually are, and the honest cycle time —
 * over the lines whose stages were ticked on different days — is computed
 * beside the flattering one rather than instead of it.
 */

const SQL = `
  select
    o.order_no,
    o.order_date,
    o.party_name,
    o.agent,
    li.quality,
    li.design_no,
    li.qty_mtr,
    li.line_total,
    ${STAGES.map(
      (s, i) => `
    max(p.is_done::int)      filter (where p.stage_key = '${s.key}') as s${i}_done,
    max(p.actual_at)         filter (where p.stage_key = '${s.key}') as s${i}_at,
    max(p.planned_at)        filter (where p.stage_key = '${s.key}') as s${i}_plan,
    max(p.delay_minutes)     filter (where p.stage_key = '${s.key}') as s${i}_delay`,
    ).join(",")}
  from ld_order_entry.order_line_items li
  join ld_order_entry.customer_orders o on o.id = li.order_id
  left join ld_order_entry.line_stage_progress p on p.order_line_item_id = li.id
  where not li.is_deleted and not li.is_cancelled
    and ($1::date is null or o.order_date >= $1::date)
    and ($2::date is null or o.order_date <= $2::date)
    ${ORDER_FILTER_SQL}
  group by o.order_no, o.order_date, o.party_name, o.agent,
           li.id, li.quality, li.design_no, li.qty_mtr, li.line_total
  order by o.order_date desc, o.order_no desc
`;

type Raw = Record<string, string | number | boolean | null>;

async function run(params: ReportParams): Promise<ReportResult> {
  const raw = (await pg.unsafe(SQL, orderFilterArgs(params))) as unknown as Raw[];

  const rows: ReportRow[] = raw.slice(0, MAX_EXPORT_ROWS).map((r) => {
    const out: ReportRow = {
      order_no: r.order_no as string,
      order_date: String(r.order_date ?? "").slice(0, 10) || null,
      party_name: r.party_name as string | null,
      agent: r.agent as string | null,
      quality: r.quality as string | null,
      design_no: r.design_no as string | null,
      qty_mtr: n(r.qty_mtr as string),
      line_total: money2(r.line_total as string),
    };

    let reached = "Not started";
    let doneCount = 0;
    for (const [i, s] of STAGES.entries()) {
      const done = n(r[`s${i}_done`] as number) === 1;
      const at = r[`s${i}_at`] as string | null;
      const delay = r[`s${i}_delay`] as number | null;
      out[`s${i}_done`] = done;
      out[`s${i}_at`] = done ? at : null;
      // Days, not minutes — nobody reads a delay of 22,608 minutes.
      out[`s${i}_late`] = done && delay != null ? Math.round((delay / 1440) * 10) / 10 : null;
      if (done) {
        reached = s.label;
        doneCount += 1;
      }
    }
    out.reached = reached;
    out.stages_done = doneCount;

    const first = r.s0_at as string | null;
    const last = r.s6_at as string | null;
    out.days_start_to_finish =
      first && last
        ? Math.round(((new Date(last).getTime() - new Date(first).getTime()) / 86_400_000) * 10) / 10
        : null;
    return out;
  });

  // ── the funnel, over every matching line ────────────────────────────────
  const reachedCount = STAGES.map((_, i) => raw.filter((r) => n(r[`s${i}_done`] as number) === 1).length);
  const total = raw.length;

  const funnel: Panel = {
    title: "Where the work gets to",
    valueLabel: "Lines",
    kind: "funnel",
    rows: STAGES.map((s, i) => ({
      label: s.label,
      value: reachedCount[i],
      display: count(reachedCount[i]),
      share: total ? (reachedCount[i] / total) * 100 : 0,
      // The drop since the stage above is the useful number, and it has to be
      // read off two rows otherwise.
      meta: i > 0 && reachedCount[i - 1] - reachedCount[i] > 0
        ? `−${count(reachedCount[i - 1] - reachedCount[i])}`
        : undefined,
    })),
    note: "How many lines have finished each stage, and how many fell away since the one above.",
  };

  // The biggest single fall between consecutive stages — where work piles up.
  let worstDrop = { from: "", to: "", lost: 0 };
  for (let i = 1; i < STAGES.length; i++) {
    const lost = reachedCount[i - 1] - reachedCount[i];
    if (lost > worstDrop.lost) worstDrop = { from: STAGES[i - 1].label, to: STAGES[i].label, lost };
  }

  // ── cycle time, told twice ──────────────────────────────────────────────
  const allDays: number[] = [];
  const realDays: number[] = [];
  for (const r of raw) {
    const first = r.s0_at as string | null;
    const last = r.s6_at as string | null;
    if (!first || !last) continue;
    const d = (new Date(last).getTime() - new Date(first).getTime()) / 86_400_000;
    if (!Number.isFinite(d)) continue;
    allDays.push(d);
    // The subset where the stamps describe WORK: more than a few hours apart,
    // so a line ticked start-to-finish in one sitting is excluded.
    if (d >= 0.25) realDays.push(d);
  }
  const all = spread(allDays);
  const real = spread(realDays);

  const doneStages = raw.reduce((s, r) => s + STAGES.filter((_, i) => n(r[`s${i}_done`] as number) === 1).length, 0);
  const onTimeStages = raw.reduce(
    (s, r) =>
      s +
      STAGES.filter((_, i) => {
        const d = r[`s${i}_delay`] as number | null;
        return n(r[`s${i}_done`] as number) === 1 && d != null && d <= 0;
      }).length,
    0,
  );

  const insights: string[] = [];
  if (total) {
    insights.push(
      `${count(reachedCount[0])} of ${count(total)} lines have started and ${count(reachedCount[6])} have finished — ` +
        `${pct((reachedCount[6] / total) * 100, 0)} all the way through.`,
    );
  }
  if (worstDrop.lost > 0) {
    insights.push(
      `The biggest gap is between ${worstDrop.from} and ${worstDrop.to}: ${count(worstDrop.lost)} lines have passed the first and not the second.`,
    );
  }
  if (real.n > 0 && real.median !== null) {
    insights.push(
      `Of the ${count(real.n)} lines whose stages were ticked on different days, the middle one took ${real.median.toFixed(1)} days ` +
        `start to finish and the slowest tenth took over ${real.p90?.toFixed(1)} days.`,
    );
  }
  if (all.n > 0 && all.median !== null && all.median < 0.5) {
    insights.push(
      `Across all ${count(all.n)} finished lines the middle time is ${all.median.toFixed(1)} days — that is bulk ticking, not production. ` +
        `The figure above is the honest one.`,
    );
  }
  if (doneStages > 0) {
    insights.push(
      `${pct((onTimeStages / doneStages) * 100, 1)} of ${count(doneStages)} completed stages were TICKED on or before their planned date.`,
    );
  }

  return {
    rows,
    totalRows: total,
    analysis: {
      headline:
        total > 0
          ? `${count(reachedCount[6])} of ${count(total)} lines are finished. The other ${count(total - reachedCount[6])} are still somewhere in the mill.`
          : "No lines in this period.",
      kpis: [
        { label: "Lines", value: count(total), sub: "cancelled left out" },
        { label: "Started", value: count(reachedCount[0]), tone: "good", sub: total ? pct((reachedCount[0] / total) * 100, 0) : undefined },
        { label: "Finished", value: count(reachedCount[6]), tone: reachedCount[6] < total / 2 ? "warn" : "good", sub: total ? pct((reachedCount[6] / total) * 100, 0) : undefined },
        { label: "Still open", value: count(total - reachedCount[6]), tone: "bad" },
        { label: "Middle cycle", value: real.median !== null ? `${real.median.toFixed(1)} d` : "—", sub: "ticked on different days" },
        { label: "Slowest tenth", value: real.p90 !== null ? `${real.p90.toFixed(1)} d` : "—", tone: "warn", sub: "90th percentile" },
        { label: "Ticked on time", value: doneStages ? pct((onTimeStages / doneStages) * 100, 1) : "—", tone: "warn", sub: "read the note below" },
        { label: "Open value", value: inrShort(raw.filter((r) => n(r.s6_done as number) !== 1).reduce((s, r) => s + n(r.line_total as string), 0)), tone: "warn" },
      ],
      panels: [
        funnel,
        {
          title: "Who is waiting on the most lines",
          valueLabel: "Lines",
          rows: rank(
            [...raw.filter((r) => n(r.s6_done as number) !== 1).reduce((m, r) => {
              const k = (r.party_name as string)?.trim() || "Not recorded";
              m.set(k, (m.get(k) ?? 0) + 1);
              return m;
            }, new Map<string, number>())].map(([label, v]) => ({ label, value: v })),
            count,
          ),
        },
        {
          title: "Whose money is still in the mill",
          valueLabel: "Value",
          rows: rank(
            [...raw.filter((r) => n(r.s6_done as number) !== 1).reduce((m, r) => {
              const k = (r.party_name as string)?.trim() || "Not recorded";
              m.set(k, (m.get(k) ?? 0) + n(r.line_total as string));
              return m;
            }, new Map<string, number>())].map(([label, v]) => ({ label, value: v })),
            inrShort,
          ),
        },
        {
          title: "Which cloth is holding things up",
          valueLabel: "Lines",
          rows: rank(
            [...raw.filter((r) => n(r.s6_done as number) !== 1).reduce((m, r) => {
              const k = (r.quality as string)?.trim() || "Not recorded";
              m.set(k, (m.get(k) ?? 0) + 1);
              return m;
            }, new Map<string, number>())].map(([label, v]) => ({ label, value: v })),
            count,
          ),
        },
      ],
      insights,
      caveats: [
        RECORDED_CAVEAT,
        "Cancelled and deleted lines are excluded entirely — this report is about work in the mill, not about what was written.",
        ...(total > MAX_EXPORT_ROWS
          ? [`Only the first ${count(MAX_EXPORT_ROWS)} of ${count(total)} lines are in the Data sheet. The figures above cover all of them.`]
          : []),
      ],
    },
  };
}

export const productionStatus: ReportDefinition = {
  id: "order-entry.production-status",
  module: "order-entry",
  title: "Production status",
  description:
    "Every live line against all seven stages — what is ticked, when, and how far past its planned date. Carries the funnel and the honest cycle time.",
  defaultMonthsBack: 2,
  columns: [
    { key: "order_no", label: "Order no", type: "text", width: 14 },
    { key: "order_date", label: "Order date", type: "date" },
    { key: "party_name", label: "Party", type: "text", width: 30 },
    { key: "agent", label: "Agent", type: "text", width: 20 },
    { key: "quality", label: "Quality", type: "text", width: 24 },
    { key: "design_no", label: "Design no", type: "text", width: 15 },
    { key: "qty_mtr", label: "Metres", type: "number" },
    { key: "line_total", label: "Line value", type: "money" },
    { key: "reached", label: "Reached", type: "text", width: 17 },
    { key: "stages_done", label: "Stages done", type: "int", total: "avg", note: "Out of seven. The foot shows the average across the file." },
    ...STAGES.flatMap((s, i) => [
      { key: `s${i}_done`, label: `${s.label} — done`, type: "boolean" as const },
      { key: `s${i}_at`, label: `${s.label} — ticked`, type: "datetime" as const, note: "When somebody pressed the button, not necessarily when the work happened." },
      {
        key: `s${i}_late`,
        label: `${s.label} — days late`,
        type: "number" as const,
        total: "avg" as const,
        note: "Ticked date minus planned date, in days. Negative means early. The foot shows the average, since adding days together means nothing.",
      },
    ]),
    { key: "days_start_to_finish", label: "Days start to finish", type: "number", total: "avg", note: "Order Entry ticked to Received LR ticked. Zero means both were ticked the same day. Averaged at the foot." },
  ],
  filters: [
    { key: "dateRange", label: "Order date", kind: "dateRange" },
    { key: "party", label: "Party", kind: "select", options: () => distinctValues("party_name") },
    { key: "agent", label: "Agent", kind: "select", options: () => distinctValues("agent") },
    { key: "salesPerson", label: "Sales person", kind: "select", options: () => distinctValues("sales_person") },
  ],
  run,
};
