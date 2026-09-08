import "server-only";

import { sql as pg } from "@/db";
import { concentration, concentrationInsight, matrixFrom, rank, spread, trend, trendInsight } from "../analysis";
import { count, pct, qty } from "../format";
import type { ReportDefinition, ReportParams, ReportResult, ReportRow } from "../types";
import { MAX_EXPORT_ROWS } from "../types";
import {
  distinctReasons,
  distinctReturnValues,
  distinctStatuses,
  filterArgs,
  money2,
  n,
  noValueCaveat,
  RETURN_FILTER_SQL,
} from "./shared";

/**
 * Return item detail — one row per piece of cloth on a return.
 *
 * ── WHY THE VALUE COLUMN IS THE RETURN'S, NOT THE ITEM'S ─────────────────
 *
 * `return_items` carries a quantity and a piece count and NO money. The value
 * lives on the return header, and where a return has four items there is no
 * honest way to split it — nothing records what each cloth was worth. So the
 * header value is repeated on each row and the column is named for what it is:
 * "Whole return value". Adding that column up over a multi-item return
 * double-counts, which is exactly why it does not sum at the foot and says so.
 *
 * That is a real limitation of the source data, not a shortcut. 309 of the 341
 * returns have a single item, so for the great majority the two are the same
 * number anyway — but the 32 that do not are the ones somebody would be
 * reconciling when it mattered.
 *
 * ── THE QUALITY NAME IS A SNAPSHOT ───────────────────────────────────────
 *
 * `quality_name` is written onto the item when it is entered. Renaming a cloth
 * in the master list does not rewrite it, which is correct: a return raised in
 * April said what it said. Both are carried, so a mismatch is visible.
 */
const SQL = `
  select
    i.id,
    r.display_id,
    r.dated,
    r.bill_no,
    p.name as party,
    b.name as broker,
    t.name as transport,
    i.quality_name,
    q.name as quality_now,
    i.quantity,
    i.pieces,
    r.return_reason,
    r.custom_reason,
    r.total_value as return_value,
    r.status::text as status,
    r.received_at,
    (select count(*) from goods_return.return_items x where x.return_id = r.id) as items_on_return
  from goods_return.return_items i
  join goods_return.returns r        on r.id = i.return_id
  left join goods_return.qualities q on q.id = i.quality_id
  left join goods_return.parties p   on p.id = r.party_id
  left join goods_return.brokers b   on b.id = r.broker_id
  left join goods_return.transports t on t.id = r.transport_id
  where ($1::date is null or r.dated >= $1::date)
    and ($2::date is null or r.dated <= $2::date)
    ${RETURN_FILTER_SQL}
  -- The item id last, so the lines inside one return always come out in the
  -- same order and two runs of the same period give the same file.
  order by r.dated desc, r.display_id desc, i.quality_name, i.id
`;

type Raw = {
  id: number; display_id: string; dated: string; bill_no: string | null; party: string | null;
  broker: string | null; transport: string | null; quality_name: string | null; quality_now: string | null;
  quantity: string; pieces: number | null; return_reason: string | null; custom_reason: string | null;
  return_value: string | null; status: string; received_at: string | null; items_on_return: number;
};

async function run(params: ReportParams): Promise<ReportResult> {
  const raw = (await pg.unsafe(SQL, filterArgs(params))) as unknown as Raw[];

  const rows: ReportRow[] = raw.slice(0, MAX_EXPORT_ROWS).map((r) => ({
    display_id: r.display_id,
    dated: r.dated?.slice(0, 10) ?? null,
    bill_no: r.bill_no,
    party: r.party,
    broker: r.broker,
    transport: r.transport,
    quality: r.quality_name,
    quality_now: r.quality_now,
    renamed_since: !!r.quality_name && !!r.quality_now && r.quality_name !== r.quality_now,
    quantity: n(r.quantity),
    // NULL stays blank. 175 of 391 items record no piece count, and printing
    // 0 made a total built from 56% of the rows look like it covered them all.
    pieces: r.pieces == null ? null : n(r.pieces),
    metres_per_piece: n(r.pieces) > 0 ? money2(n(r.quantity) / n(r.pieces)) : null,
    return_reason: r.return_reason,
    custom_reason: r.custom_reason,
    items_on_return: n(r.items_on_return),
    return_value: r.return_value == null ? null : money2(r.return_value),
    received: r.status === "received",
    received_on: r.received_at?.slice(0, 10) ?? null,
  }));

  // ── the figures ─────────────────────────────────────────────────────────
  const totalQty = raw.reduce((s, r) => s + n(r.quantity), 0);
  const totalPieces = raw.reduce((s, r) => s + n(r.pieces), 0);
  const returns = new Set(raw.map((r) => r.display_id)).size;
  // Counted over RETURNS, not items - the caveat is about returns.
  const noValueReturns = new Set(
    raw.filter((r) => r.return_value == null || n(r.return_value) === 0).map((r) => r.display_id),
  ).size;

  const byQuality = new Map<string, number>();
  const qualityLines = new Map<string, number>();
  const byParty = new Map<string, number>();
  const byReason = new Map<string, number>();
  const byMonth = new Map<string, number>();
  for (const r of raw) {
    const q = r.quality_name?.trim() || "Not recorded";
    byQuality.set(q, (byQuality.get(q) ?? 0) + n(r.quantity));
    qualityLines.set(q, (qualityLines.get(q) ?? 0) + 1);
    byParty.set(r.party?.trim() || "Not recorded", (byParty.get(r.party?.trim() || "Not recorded") ?? 0) + n(r.quantity));
    byReason.set(r.return_reason?.trim() || "Not recorded", (byReason.get(r.return_reason?.trim() || "Not recorded") ?? 0) + n(r.quantity));
    const m = r.dated?.slice(0, 7);
    if (m) byMonth.set(m, (byMonth.get(m) ?? 0) + n(r.quantity));
  }

  const t = trend(byMonth, qty);
  const conc = concentration([...byQuality].map(([label, value]) => ({ label, value })));
  const sizes = spread(raw.map((r) => n(r.quantity)).filter((x) => x > 0));
  const renamed = rows.filter((r) => r.renamed_since === true).length;
  const multi = raw.filter((r) => n(r.items_on_return) > 1).length;

  const insights: string[] = [];
  const ti = trendInsight(t, "metres returned");
  if (ti) insights.push(ti);
  const ci = concentrationInsight(conc, "cloths", false);
  if (ci) insights.push(ci);
  if (sizes.n > 0 && sizes.median !== null) {
    insights.push(
      `The middle item is ${qty(sizes.median)} metres; the range runs ${qty(sizes.min ?? 0)} to ${qty(sizes.max ?? 0)}.`,
    );
  }
  if (byQuality.size) {
    const worst = [...byQuality].sort((a, b) => b[1] - a[1])[0];
    insights.push(
      `${worst[0]} came back most — ${qty(worst[1])} metres over ${count(qualityLines.get(worst[0]) ?? 0)} items, ${pct(totalQty > 0 ? (worst[1] / totalQty) * 100 : 0, 0)} of everything returned.`,
    );
  }
  if (multi) {
    insights.push(
      `${count(multi)} of ${count(raw.length)} items sit on a return that has more than one cloth on it. Their Whole return value column repeats the header figure, so do not add that column up.`,
    );
  }
  if (renamed) {
    insights.push(
      `${count(renamed)} items name a cloth that has since been renamed in the master list. Both names are carried; the one on the return is what was written at the time.`,
    );
  }

  return {
    rows,
    totalRows: raw.length,
    analysis: {
      headline: raw.length
        ? `${count(raw.length)} items came back across ${count(returns)} returns — ${qty(totalQty)} metres of ${count(byQuality.size)} different cloths.`
        : "No return items in this period.",
      kpis: [
        { label: "Items", value: count(raw.length), sub: `${count(returns)} returns` },
        { label: "Metres back", value: qty(totalQty), tone: "bad" },
        { label: "Pieces", value: count(totalPieces) },
        { label: "Cloths involved", value: count(byQuality.size) },
        { label: "Parties involved", value: count(byParty.size) },
        { label: "Middle item size", value: sizes.median !== null ? `${qty(sizes.median)} m` : "—", sub: "half are bigger, half smaller" },
        { label: "Biggest single item", value: sizes.max !== null ? `${qty(sizes.max)} m` : "—" },
        { label: "On multi-cloth returns", value: count(multi), tone: multi ? "warn" : "neutral", sub: "value column repeats there" },
      ],
      trend: t.points.length > 1
        ? { title: "How many metres came back each month", valueLabel: "Metres", points: t.points, averageLabel: "Average month in this period" }
        : undefined,
      panels: [
        { title: "Which cloth comes back most", valueLabel: "Metres", rows: rank([...byQuality].map(([label, value]) => ({ label, value, meta: `${qualityLines.get(label) ?? 0} items` })), qty) },
        {
          title: "Is it a few cloths or many",
          valueLabel: "Metres",
          kind: "share",
          rows: rank([...byQuality].map(([label, value]) => ({ label, value })), qty, 5),
          note: "A wide first block means one cloth is the whole problem.",
        },
        { title: "Which parties send the most metres back", valueLabel: "Metres", rows: rank([...byParty].map(([label, value]) => ({ label, value })), qty) },
        { title: "Why, by the metre", valueLabel: "Metres", rows: rank([...byReason].map(([label, value]) => ({ label, value })), qty, 8), note: "The same reasons weighted by cloth rather than by return." },
      ],
      matrix: matrixFrom(
        raw.map((r) => ({ label: r.quality_name?.trim() || "Not recorded", month: r.dated?.slice(0, 7) ?? "", value: n(r.quantity) })),
        { title: "Which cloth came back, and when", format: "count", display: qty, note: "Metres, for the eight cloths that came back most." },
      ),
      insights,
      caveats: [
        "The value column is the WHOLE RETURN's value repeated on every one of its items — the source data records no money against an individual cloth. It does not add up at the foot, and on a multi-cloth return it must not be summed.",
        noValueCaveat(noValueReturns, returns),
        "The cloth name is a snapshot taken when the return was entered. Renaming it in the master list afterwards does not rewrite it, which is correct — the return said what it said. The current name is carried beside it.",
      ],
    },
  };
}

export const returnItemDetail: ReportDefinition = {
  id: "goods-return.item-detail",
  module: "goods-return",
  title: "Return item detail",
  description:
    "One row per cloth on a return — metres, pieces, why it came back and who sent it. The grain for pivoting returns by cloth.",
  defaultMonthsBack: 6,
  columns: [
    { key: "display_id", label: "LD no", type: "text", width: 12 },
    { key: "dated", label: "Dated", type: "date" },
    { key: "bill_no", label: "Bill no", type: "text", width: 12 },
    { key: "party", label: "Party", type: "text", width: 30 },
    { key: "broker", label: "Broker", type: "text", width: 22 },
    { key: "transport", label: "Transport", type: "text", width: 20 },
    { key: "quality", label: "Cloth", type: "text", width: 26, note: "As written on the return." },
    { key: "quality_now", label: "Cloth, current name", type: "text", width: 26, optional: true, note: "What that cloth is called in the master list today." },
    { key: "renamed_since", label: "Renamed since", type: "boolean", note: "The two names differ, so the cloth was renamed after this return was raised." },
    { key: "quantity", label: "Metres", type: "number", unit: "MTR" },
    { key: "pieces", label: "Pieces", type: "int", unit: "PCS", note: "Blank where the return did not record one — a blank is not a zero, and roughly half the items have none." },
    { key: "metres_per_piece", label: "Metres a piece", type: "number", total: "avg", avgWeightBy: "pieces", note: "Metres divided by pieces. The foot is weighted by pieces, not a plain average of the rows." },
    { key: "return_reason", label: "Reason", type: "text", width: 24 },
    { key: "custom_reason", label: "Reason, in their words", type: "text", width: 28, optional: true },
    { key: "items_on_return", label: "Items on the return", type: "int", total: "none", note: "More than one means the value column beside it is shared across several cloths." },
    { key: "return_value", label: "Whole return value", type: "money", total: "none", note: "The value of the WHOLE return, repeated on each of its items. Never add this column up — it double-counts every multi-cloth return." },
    { key: "received", label: "Received", type: "boolean" },
    { key: "received_on", label: "Received on", type: "date" },
  ],
  filters: [
    { key: "dateRange", label: "Return date", kind: "dateRange" },
    { key: "party", label: "Party", kind: "select", options: () => distinctReturnValues("party") },
    { key: "broker", label: "Broker", kind: "select", options: () => distinctReturnValues("broker") },
    { key: "transport", label: "Transport", kind: "select", options: () => distinctReturnValues("transport") },
    { key: "reason", label: "Reason", kind: "select", options: distinctReasons },
    { key: "status", label: "Status", kind: "select", options: distinctStatuses },
  ],
  run,
};
