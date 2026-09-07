import "server-only";

import { sql as pg } from "@/db";
import { todayIso } from "@/lib/dates";
import { AGE_BUCKETS, ageing, concentration, concentrationInsight, matrixFrom, monthDelta, rank, spread, trend, trendInsight } from "../analysis";
import { count, inrShort, pct, qty } from "../format";
import type { ReportDefinition, ReportParams, ReportResult, ReportRow } from "../types";
import { MAX_EXPORT_ROWS } from "../types";
import {
  BACKDATED_CAVEAT,
  daysBetweenIso,
  distinctReasons,
  distinctReturnValues,
  distinctStatuses,
  EARLIEST_SANE,
  filterArgs,
  money2,
  n,
  NO_VALUE_CAVEAT,
  RECEIVED_CAVEAT,
  RETURN_FILTER_SQL,
} from "./shared";

/**
 * Return register — one row per return, and the record of what came back.
 *
 * ── IT ABSORBS THE RECEIVING VIEW, IT DOES NOT SIT BESIDE IT ─────────────
 *
 * The obvious second report is "receiving status": which returns are still out,
 * how long they have been out. That is one row per return with the same party,
 * the same value and the same transport — the same sheet twice, which is
 * exactly the duplication the owner had cut out of Orders. So the receiving
 * columns live here (`received`, `days_to_receive`, `days_waiting`, `age`) and
 * filtering `Received` to No reproduces that report exactly.
 *
 * ── THE CHARGES ARE FOUR SEPARATE FACTS ──────────────────────────────────
 *
 * Transport and other charges are what it cost to send the cloth back; the two
 * Bhiwandi figures are what was paid at the receiving end and are only known
 * once it arrives. `total_cost` adds all four, and the four stay beside it,
 * because "why is this return's cost ₹1,200" is a question with four possible
 * answers and a single column cannot say which.
 */
const SQL = `
  select
    r.id,
    r.display_id,
    r.dated,
    r.bill_no,
    r.entry_for,
    r.tracking_no,
    p.name  as party,
    b.name  as broker,
    t.name  as transport,
    r.return_reason,
    r.custom_reason,
    count(i.id)                              as items,
    coalesce(sum(i.quantity), 0)             as qty,
    coalesce(sum(i.pieces), 0)               as pieces,
    count(distinct i.quality_id)             as qualities,
    -- max(), not sum(): the join to items multiplies the header row, and a
    -- return with four items would otherwise report four times its value.
    -- This is the same trap that reported 2,900 orders in Orders' first draft.
    max(r.total_value)                       as value,
    max(r.transport_value)                   as transport_value,
    max(r.other_charges)                     as other_charges,
    max(r.bhiwandi_transport_value)          as bhiwandi_transport_value,
    max(r.bhiwandi_charges)                  as bhiwandi_charges,
    r.status::text                           as status,
    r.posted_on,
    r.received_at,
    r.receiving_notes,
    (r.attachment_url is not null and r.attachment_url <> '') as has_attachment,
    r.created_at
  from goods_return.returns r
  left join goods_return.parties p    on p.id = r.party_id
  left join goods_return.brokers b    on b.id = r.broker_id
  left join goods_return.transports t on t.id = r.transport_id
  left join goods_return.return_items i on i.return_id = r.id
  where ($1::date is null or r.dated >= $1::date)
    and ($2::date is null or r.dated <= $2::date)
    ${RETURN_FILTER_SQL}
  group by r.id, p.name, b.name, t.name
  -- Newest first, then the LD number, then the id — the id is the tiebreak
  -- that makes two runs of the same period produce the same file.
  order by r.dated desc, r.display_id desc, r.id desc
`;

type Raw = {
  id: number; display_id: string; dated: string; bill_no: string | null; entry_for: string | null;
  tracking_no: string | null; party: string | null; broker: string | null; transport: string | null;
  return_reason: string | null; custom_reason: string | null; items: number; qty: string; pieces: number;
  qualities: number; value: string | null; transport_value: string | null; other_charges: string | null;
  bhiwandi_transport_value: string | null; bhiwandi_charges: string | null; status: string;
  posted_on: string | null; received_at: string | null; receiving_notes: string | null;
  has_attachment: boolean; created_at: string;
};

const bucketOf = (d: number) => AGE_BUCKETS.find((b) => d <= b.max)?.label ?? "Over 60 days";

async function run(params: ReportParams): Promise<ReportResult> {
  const raw = (await pg.unsafe(SQL, filterArgs(params))) as unknown as Raw[];
  const today = todayIso();

  const rows: ReportRow[] = raw.slice(0, MAX_EXPORT_ROWS).map((r) => {
    const dated = r.dated?.slice(0, 10) ?? null;
    const received = r.status === "received";
    const receivedOn = r.received_at?.slice(0, 10) ?? null;
    // Only when the receipt genuinely follows the return. 72 rows were entered
    // after the fact and would otherwise print a negative number of days.
    const toReceive = received && receivedOn && dated && receivedOn >= dated
      ? daysBetweenIso(dated, receivedOn)
      : null;
    const waiting = !received && dated ? daysBetweenIso(dated, today) : null;
    const charges =
      n(r.transport_value) + n(r.other_charges) + n(r.bhiwandi_transport_value) + n(r.bhiwandi_charges);

    return {
      display_id: r.display_id,
      dated,
      bill_no: r.bill_no,
      entry_for: r.entry_for,
      tracking_no: r.tracking_no,
      party: r.party,
      broker: r.broker,
      transport: r.transport,
      return_reason: r.return_reason,
      custom_reason: r.custom_reason,
      items: n(r.items),
      qualities: n(r.qualities),
      qty: n(r.qty),
      pieces: n(r.pieces),
      value: r.value == null ? null : money2(r.value),
      no_value: r.value == null || n(r.value) === 0,
      transport_value: money2(r.transport_value ?? 0),
      other_charges: money2(r.other_charges ?? 0),
      bhiwandi_transport_value: money2(r.bhiwandi_transport_value ?? 0),
      bhiwandi_charges: money2(r.bhiwandi_charges ?? 0),
      total_cost: money2(charges),
      received,
      status_label: received ? "Received at Bhiwandi" : "Sent, not yet received",
      posted_on: r.posted_on?.slice(0, 10) ?? null,
      received_on: receivedOn,
      received_no_date: received && !receivedOn,
      days_to_receive: toReceive,
      days_waiting: waiting,
      age: received ? "Received" : waiting == null ? "Unknown" : bucketOf(waiting),
      date_looks_wrong: !!dated && dated < EARLIEST_SANE,
      has_attachment: r.has_attachment,
      receiving_notes: r.receiving_notes,
      created_at: r.created_at,
    };
  });

  // ── the figures ─────────────────────────────────────────────────────────
  const withValue = raw.filter((r) => r.value != null && n(r.value) > 0);
  const totalValue = withValue.reduce((s, r) => s + n(r.value), 0);
  const noValue = raw.length - withValue.length;
  const totalQty = raw.reduce((s, r) => s + n(r.qty), 0);
  const totalPieces = raw.reduce((s, r) => s + n(r.pieces), 0);
  const totalCost = raw.reduce(
    (s, r) => s + n(r.transport_value) + n(r.other_charges) + n(r.bhiwandi_transport_value) + n(r.bhiwandi_charges),
    0,
  );

  const open = raw.filter((r) => r.status !== "received");
  const openValue = open.reduce((s, r) => s + n(r.value), 0);
  const openDays = open
    .map((r) => daysBetweenIso(r.dated?.slice(0, 10) ?? null, today))
    .filter((d): d is number => d != null && d >= 0);
  const openOver30 = openDays.filter((d) => d > 30).length;

  const turnarounds = raw
    .filter((r) => r.status === "received" && r.received_at && r.dated && r.received_at.slice(0, 10) >= r.dated.slice(0, 10))
    .map((r) => daysBetweenIso(r.dated.slice(0, 10), r.received_at!.slice(0, 10)))
    .filter((d): d is number => d != null);
  const turn = spread(turnarounds);
  const receivedNoDate = raw.filter((r) => r.status === "received" && !r.received_at).length;
  const wrongDate = raw.filter((r) => r.dated && r.dated.slice(0, 10) < EARLIEST_SANE).length;

  const byMonth = new Map<string, number>();
  const byParty = new Map<string, number>();
  const byReason = new Map<string, number>();
  const byTransport = new Map<string, number>();
  const partyReturns = new Map<string, number>();
  for (const r of raw) {
    const m = r.dated?.slice(0, 7);
    if (m) byMonth.set(m, (byMonth.get(m) ?? 0) + n(r.value));
    const party = r.party?.trim() || "Not recorded";
    byParty.set(party, (byParty.get(party) ?? 0) + n(r.value));
    partyReturns.set(party, (partyReturns.get(party) ?? 0) + 1);
    // Counted by RETURNS, not value — 26 have no value and a reason chart
    // weighted by money would leave them out of the very thing being counted.
    byReason.set(r.return_reason?.trim() || "Not recorded", (byReason.get(r.return_reason?.trim() || "Not recorded") ?? 0) + 1);
    byTransport.set(r.transport?.trim() || "Not recorded", (byTransport.get(r.transport?.trim() || "Not recorded") ?? 0) + 1);
  }

  const t = trend(byMonth, inrShort);
  const conc = concentration([...byParty].map(([label, value]) => ({ label, value })));

  const insights: string[] = [];
  const ti = trendInsight(t, "returned value");
  if (ti) insights.push(ti);
  const ci = concentrationInsight(conc, "parties");
  if (ci) insights.push(ci);
  if (raw.length) {
    const topReason = [...byReason].sort((a, b) => b[1] - a[1])[0];
    if (topReason) {
      insights.push(
        `${count(topReason[1])} of ${count(raw.length)} returns came back for one reason — ${topReason[0]} — which is ${pct((topReason[1] / raw.length) * 100, 0)} of everything sent back.`,
      );
    }
  }
  if (open.length) {
    insights.push(
      `${count(open.length)} returns worth ${inrShort(openValue)} have been sent and not yet received at Bhiwandi` +
        (openOver30 ? `, and ${count(openOver30)} of those have been out over a month.` : "."),
    );
  }
  if (turn.n > 0 && turn.median !== null) {
    insights.push(
      `Of the ${count(turn.n)} returns with a usable receipt date, the middle one took ${turn.median.toFixed(0)} days to reach Bhiwandi and the slowest tenth took over ${turn.p90?.toFixed(0)} days.`,
    );
  }
  if (totalCost > 0) {
    insights.push(
      `${inrShort(totalCost)} was spent moving the returns — ${pct(totalValue > 0 ? (totalCost / totalValue) * 100 : 0, 1)} of the value that came back.`,
    );
  }
  if (noValue) {
    insights.push(
      `${count(noValue)} returns carry no value at all. They are counted as returns and left out of every money figure; the Value column is blank on those rows.`,
    );
  }

  return {
    rows,
    totalRows: raw.length,
    analysis: {
      headline: raw.length
        ? `${count(raw.length)} returns worth ${inrShort(totalValue)} came back — ${count(open.length)} of them are still on the way to Bhiwandi.`
        : "No returns in this period.",
      kpis: [
        { label: "Returns", value: count(raw.length), tone: "neutral" },
        { label: "Value returned", value: inrShort(totalValue), tone: "bad", sub: noValue ? `${count(noValue)} with no value entered` : undefined, deltaPct: monthDelta(byMonth), lowerIsBetter: true },
        { label: "Metres back", value: qty(totalQty), sub: `${count(totalPieces)} pieces` },
        { label: "Cost of moving it", value: inrShort(totalCost), tone: "warn", sub: totalValue > 0 ? `${pct((totalCost / totalValue) * 100, 1)} of the value` : undefined },
        { label: "Still on the way", value: count(open.length), tone: open.length ? "warn" : "good", lowerIsBetter: true, sub: inrShort(openValue) },
        { label: "Out over a month", value: count(openOver30), tone: openOver30 ? "bad" : "good", lowerIsBetter: true, sub: open.length ? `${pct((openOver30 / open.length) * 100, 0)} of those still out` : undefined },
        { label: "Typical turnaround", value: turn.median !== null ? `${turn.median.toFixed(0)} d` : "—", sub: turn.n ? `over ${count(turn.n)} returns` : undefined },
        { label: "Parties involved", value: count(byParty.size), sub: conc.topLabel ? `biggest ${conc.topLabel}` : undefined },
      ],
      trend: t.points.length > 1
        ? { title: "What came back each month", valueLabel: "Value returned", points: t.points, averageLabel: "Average month in this period" }
        : undefined,
      panels: [
        {
          title: "Why the cloth came back",
          valueLabel: "Returns",
          rows: rank([...byReason].map(([label, value]) => ({ label, value })), count, 8),
          note: "Counted by return, not by value — a quarter of them have no value entered and would otherwise vanish from this chart.",
        },
        {
          title: "Which parties send the most back",
          valueLabel: "Value",
          rows: rank([...byParty].map(([label, value]) => ({ label, value, meta: `${partyReturns.get(label) ?? 0} returns` })), inrShort),
        },
        {
          title: "How much rests on a few parties",
          valueLabel: "Value",
          kind: "share",
          rows: rank([...byParty].map(([label, value]) => ({ label, value })), inrShort, 5),
          note: "A wide first block means the returns problem is really one customer's.",
        },
        {
          ...ageing(openDays),
          title: "How long the unreceived ones have been out",
          valueLabel: "Returns",
          note: "Counted from the return's own date to today.",
        },
        {
          title: "Which transports carry them",
          valueLabel: "Returns",
          rows: rank([...byTransport].map(([label, value]) => ({ label, value })), count),
        },
      ],
      matrix: matrixFrom(
        raw.map((r) => ({ label: r.party?.trim() || "Not recorded", month: r.dated?.slice(0, 7) ?? "", value: n(r.value) })),
        { title: "Which parties sent cloth back, and when", format: "money", display: inrShort, note: "The eight biggest by value returned." },
      ),
      insights,
      caveats: [
        NO_VALUE_CAVEAT,
        RECEIVED_CAVEAT,
        BACKDATED_CAVEAT,
        ...(raw.filter((r) => r.received_at && r.dated && r.received_at.slice(0, 10) < r.dated.slice(0, 10)).length
          ? [`${raw.filter((r) => r.received_at && r.dated && r.received_at.slice(0, 10) < r.dated.slice(0, 10)).length} returns have a received date BEFORE the return's own date, from the catch-up. Days to receive is blank on those.`]
          : []),
        ...(receivedNoDate ? [`${receivedNoDate} returns are marked received with no date recorded. They count as received and are flagged in their own column.`] : []),
        ...(wrongDate ? [`${wrongDate} return is dated before ${EARLIEST_SANE}, which is a typing slip rather than a real date. It is flagged, not corrected — this ERP does not edit the Goods Return records.`] : []),
        "Who entered or received a return is not in this data. Those columns exist in the old system's own user table and are empty on every row; anything done through this ERP is in the audit log instead.",
      ],
    },
  };
}

export const returnRegister: ReportDefinition = {
  id: "goods-return.register",
  module: "goods-return",
  title: "Return register",
  description:
    "Every return at header level — party, broker, transport, why it came back, what it was worth, what moving it cost, and whether Bhiwandi has it yet. Filter Received to No for the list of what is still out.",
  defaultMonthsBack: 6,
  columns: [
    { key: "display_id", label: "LD no", type: "text", width: 12 },
    { key: "dated", label: "Dated", type: "date", note: "The date on the return itself, not when it was typed in." },
    { key: "bill_no", label: "Bill no", type: "text", width: 12 },
    { key: "entry_for", label: "Sent as", type: "text", width: 18 },
    { key: "tracking_no", label: "Tracking no", type: "text", width: 15 },
    { key: "party", label: "Party", type: "text", width: 32 },
    { key: "broker", label: "Broker", type: "text", width: 24 },
    { key: "transport", label: "Transport", type: "text", width: 22 },
    { key: "return_reason", label: "Reason", type: "text", width: 24 },
    { key: "custom_reason", label: "Reason, in their words", type: "text", width: 30, optional: true },
    { key: "items", label: "Items", type: "int", note: "How many cloth lines are on this return." },
    { key: "qualities", label: "Qualities", type: "int", total: "none", note: "Distinct cloths on this return. Not added up — the same cloth on two returns is one cloth." },
    { key: "qty", label: "Metres", type: "number" },
    { key: "pieces", label: "Pieces", type: "int" },
    { key: "value", label: "Value", type: "money", note: "Blank where nothing was entered. A blank is not a zero." },
    { key: "no_value", label: "No value entered", type: "boolean", note: "Filter this to Yes to find the returns still waiting for a figure." },
    { key: "transport_value", label: "Transport charge", type: "money" },
    { key: "other_charges", label: "Other charges", type: "money" },
    { key: "bhiwandi_transport_value", label: "Bhiwandi transport", type: "money", note: "Paid at the receiving end, so it is only known once it arrives." },
    { key: "bhiwandi_charges", label: "Bhiwandi charges", type: "money" },
    { key: "total_cost", label: "Cost of moving it", type: "money", note: "The four charge columns added together." },
    { key: "received", label: "Received", type: "boolean", note: "Filter this to No for the day's chase list." },
    { key: "status_label", label: "Status", type: "text", width: 22 },
    { key: "posted_on", label: "Posted on", type: "date" },
    { key: "received_on", label: "Received on", type: "date" },
    { key: "received_no_date", label: "Received, date missing", type: "boolean", note: "Marked received but nobody recorded when." },
    { key: "days_to_receive", label: "Days to receive", type: "int", total: "avg", note: "From the return's date to the day Bhiwandi received it. Blank where the receipt was entered before the return date. The foot shows the average, not a sum." },
    { key: "days_waiting", label: "Days waiting", type: "int", total: "avg", note: "For the ones not yet received, counted to today." },
    { key: "age", label: "Age", type: "text", width: 13 },
    { key: "date_looks_wrong", label: "Date looks wrong", type: "boolean", note: `Dated before ${EARLIEST_SANE}, so almost certainly a typing slip.` },
    { key: "has_attachment", label: "Photo kept", type: "boolean" },
    { key: "receiving_notes", label: "Receiving notes", type: "text", width: 30, optional: true },
    { key: "created_at", label: "Entered at", type: "datetime" },
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
