import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";

import { goodsReturnDb } from "@/db/goods-return";
import {
  brokers,
  parties,
  qualities,
  returnItems,
  returns,
} from "@/db/goods-return/schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Goods Return — reporting aggregates
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A rewrite of the standalone app's `lib/reports.ts`, which was four flat
 * counts (status, reason, top-10 parties, month). The owner asked for reports
 * "in depth", so this answers money, speed, who/why, fabric and trend instead.
 *
 * ── RUN THESE SEQUENTIALLY. NEVER `Promise.all`. ──────────────────────────
 *
 * Inherited verbatim from the original file, because the reason still holds and
 * is not obvious from reading the code: the pool is capped at 5 connections
 * (`src/db/index.ts`) and is shared with Order Entry, CRM and Help Slip. Fire
 * more queries at once than there are free connections and postgres.js
 * pipelines the overflow onto a connection that is already busy — and a
 * pipelined statement STALLS under Supavisor transaction pooling. It does not
 * error. The query runs, the answer never comes back, and the request hangs
 * forever. The standalone app hit exactly this with a seven-query dashboard.
 *
 * `getGoodsReturnReport` issues SEVEN queries, one per aggregate, each awaited
 * before the next begins. Against a database in the same region these are a few
 * ms each over 341 returns and 391 lines. If you add an aggregate, `await` it
 * in the chain — do not "optimise" the chain into a parallel one.
 *
 * ── HONESTY RULES, AND THE MEASUREMENTS THAT FORCED THEM ──────────────────
 *
 * Every figure here is computable from a column that exists. Where the data
 * cannot support a number, the field is `null` and the screen must say so — a
 * `0` in a money or duration column reads as a real measurement, and these
 * columns are sparse enough that it would be a lie. Measured 4 Sep 2026 over
 * all 341 live returns:
 *
 *   - Only **98 of 277** received returns have BOTH `posted_on` and
 *     `received_at` with the receipt on or after the dispatch. 131 are missing
 *     one of the two dates outright, and 48 more record a receipt date BEFORE
 *     the dispatch date. So the average transit is honest for barely a third of
 *     them, and `SpeedReport.received` ships the coverage counts next to the
 *     average so a screen can never print "62 days" unqualified.
 *   - **181 of 341** returns have no `bhiwandi_transport_value`, so the
 *     expected-vs-actual variance is computable on a subset only. It is
 *     reported as `null` when that subset is empty, never as a zero variance.
 *   - **175 of 391** quality lines record no `pieces`. `metres`/`pieces` stay
 *     `null` when nothing in a group recorded one, rather than summing to 0.
 *
 * ── `numeric` ARRIVES AS A STRING ────────────────────────────────────────
 *
 * postgres.js parses only oids 21/23/26/700/701 (int2, int4, oid, float4,
 * float8) into JS numbers. `numeric` — which is `total_value`, every charge
 * column and `quantity` — and `count(*)`'s int8 both come back as STRINGS, so
 * `"69725.00" + "1200.00"` would concatenate. Every aggregate below is cast in
 * SQL (`::float8` / `::int`) and every value is then put through `toNumber`
 * on the way out. Belt and braces on purpose: the cast is what makes it a
 * number, the helper is what guarantees it.
 *
 * `date` (oid 1082) is the opposite trap — postgres.js DOES parse it, into a
 * JS `Date`. Nothing here returns a bare date column for that reason; months
 * come back as `to_char(...)` text.
 */

// ─── range ─────────────────────────────────────────────────────────────────

/**
 * Inclusive on both ends, over `returns.dated` — the date the return was
 * raised, which is the only date present on all 341 rows. `posted_on` is null
 * on 118 of them and `received_at` on 100, so ranging over either would
 * silently drop rows from totals that ought to include them.
 */
export type ReportRange = { from?: string; to?: string };

function rangeWhere(range?: ReportRange): SQL | undefined {
  const conds: SQL[] = [];
  if (range?.from) conds.push(gte(returns.dated, range.from));
  if (range?.to) conds.push(lte(returns.dated, range.to));
  return conds.length ? and(...conds) : undefined;
}

// ─── numeric coercion ──────────────────────────────────────────────────────

function toNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Keeps a SQL `null` as `null` — an absent measurement, not a zero one. */
function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Percent change, `null` when the baseline is absent or zero (÷0 is not 0%). */
function changePct(current: number, prior: number | null): number | null {
  if (prior === null || prior === 0) return null;
  return round2(((current - prior) / prior) * 100);
}

// ─── 1. MONEY ──────────────────────────────────────────────────────────────

/**
 * Expected transport charge vs what Bhiwandi actually paid.
 *
 * Computed ONLY over returns carrying both numbers — comparing a recorded
 * figure against a missing one would report the whole of the recorded side as
 * a variance. `comparable` is that subset's size and belongs on screen beside
 * the money; `awaitingActual` counts received returns still missing Bhiwandi's
 * figure, which is what the subset is small because of.
 *
 * `differing` is the one to read first, and it is why this type exists rather
 * than a single `variance` number. Over the live data all 160 comparable rows
 * have `bhiwandi_transport_value` EXACTLY equal to `transport_value` — the
 * variance is 0.00 not because transport comes in on budget but because the
 * receiving screen's figure is being copied from the expected one instead of
 * entered from the actual bill. A lone "₹0 variance" tile would be read as good
 * news; "0 of 160 differ" is read as the data-entry gap it is.
 */
export type TransportVariance = {
  comparable: number;
  awaitingActual: number;
  expected: number;
  actual: number;
  /** `actual - expected`. Positive means Bhiwandi paid MORE than was expected. */
  variance: number;
  variancePct: number | null;
  overpaid: number;
  underpaid: number;
  matched: number;
  differing: number;
};

export type MoneySummary = {
  returns: number;
  billingValue: number;
  /** Returns with no `total_value` at all — the billing figure excludes them. */
  billingValueMissing: number;
  transportExpected: number;
  transportExpectedMissing: number;
  otherCharges: number;
  otherChargesMissing: number;
  bhiwandiTransport: number;
  bhiwandiCharges: number;
  /** Billing + both head-office charge columns. */
  totalExpectedOutlay: number;
  /** What Bhiwandi actually paid out, across both of its columns. */
  totalBhiwandiPaid: number;
  transportVariance: TransportVariance | null;
};

export async function getMoneySummary(
  range?: ReportRange,
): Promise<MoneySummary> {
  const bothTransport = sql`${returns.transportValue} is not null and ${returns.bhiwandiTransportValue} is not null`;

  const [row] = await goodsReturnDb
    .select({
      returns: sql<number>`count(*)::int`,
      billingValue: sql<number>`coalesce(sum(${returns.totalValue}), 0)::float8`,
      billingValueMissing: sql<number>`count(*) filter (where ${returns.totalValue} is null)::int`,
      transportExpected: sql<number>`coalesce(sum(${returns.transportValue}), 0)::float8`,
      transportExpectedMissing: sql<number>`count(*) filter (where ${returns.transportValue} is null)::int`,
      otherCharges: sql<number>`coalesce(sum(${returns.otherCharges}), 0)::float8`,
      otherChargesMissing: sql<number>`count(*) filter (where ${returns.otherCharges} is null)::int`,
      bhiwandiTransport: sql<number>`coalesce(sum(${returns.bhiwandiTransportValue}), 0)::float8`,
      bhiwandiCharges: sql<number>`coalesce(sum(${returns.bhiwandiCharges}), 0)::float8`,
      // The variance subset, aggregated in the same pass over the same rows.
      comparable: sql<number>`count(*) filter (where ${bothTransport})::int`,
      awaitingActual: sql<number>`count(*) filter (where ${returns.status} = 'received' and ${returns.bhiwandiTransportValue} is null)::int`,
      comparableExpected: sql<number>`coalesce(sum(${returns.transportValue}) filter (where ${bothTransport}), 0)::float8`,
      comparableActual: sql<number>`coalesce(sum(${returns.bhiwandiTransportValue}) filter (where ${bothTransport}), 0)::float8`,
      overpaid: sql<number>`count(*) filter (where ${bothTransport} and ${returns.bhiwandiTransportValue} > ${returns.transportValue})::int`,
      underpaid: sql<number>`count(*) filter (where ${bothTransport} and ${returns.bhiwandiTransportValue} < ${returns.transportValue})::int`,
      matched: sql<number>`count(*) filter (where ${bothTransport} and ${returns.bhiwandiTransportValue} = ${returns.transportValue})::int`,
    })
    .from(returns)
    .where(rangeWhere(range));

  const billingValue = round2(toNumber(row?.billingValue));
  const transportExpected = round2(toNumber(row?.transportExpected));
  const otherCharges = round2(toNumber(row?.otherCharges));
  const bhiwandiTransport = round2(toNumber(row?.bhiwandiTransport));
  const bhiwandiCharges = round2(toNumber(row?.bhiwandiCharges));

  const comparable = toNumber(row?.comparable);
  const expected = round2(toNumber(row?.comparableExpected));
  const actual = round2(toNumber(row?.comparableActual));
  const matched = toNumber(row?.matched);

  return {
    returns: toNumber(row?.returns),
    billingValue,
    billingValueMissing: toNumber(row?.billingValueMissing),
    transportExpected,
    transportExpectedMissing: toNumber(row?.transportExpectedMissing),
    otherCharges,
    otherChargesMissing: toNumber(row?.otherChargesMissing),
    bhiwandiTransport,
    bhiwandiCharges,
    totalExpectedOutlay: round2(billingValue + transportExpected + otherCharges),
    totalBhiwandiPaid: round2(bhiwandiTransport + bhiwandiCharges),
    // No comparable row means there is nothing to say, so say nothing. A zeroed
    // variance object here would render as "expected ₹0, actual ₹0, on budget".
    transportVariance:
      comparable > 0
        ? {
            comparable,
            awaitingActual: toNumber(row?.awaitingActual),
            expected,
            actual,
            variance: round2(actual - expected),
            variancePct:
              expected === 0
                ? null
                : round2(((actual - expected) / expected) * 100),
            overpaid: toNumber(row?.overpaid),
            underpaid: toNumber(row?.underpaid),
            matched,
            differing: comparable - matched,
          }
        : null,
  };
}

// ─── 2. SPEED ──────────────────────────────────────────────────────────────

export type AgeingBucketKey = "0-7" | "8-15" | "16-30" | "30+";

export type AgeingBucket = {
  bucket: AgeingBucketKey;
  label: string;
  n: number;
  value: number;
};

export type SpeedReport = {
  received: {
    total: number;
    /** Rows the average is actually built from. Print it beside `avgDays`. */
    measured: number;
    /** Received, but `posted_on` or `received_at` is absent — uncomputable. */
    missingDates: number;
    /**
     * Both dates present but the receipt lands BEFORE the dispatch. Excluded
     * from the average (it would drag the mean down by a fortnight) and
     * surfaced instead, because 48 live rows do this and that is a data
     * problem worth showing rather than a number worth smoothing.
     */
    negativeInterval: number;
    avgDays: number | null;
    medianDays: number | null;
    fastestDays: number | null;
    slowestDays: number | null;
  };
  pending: {
    total: number;
    /** Pending rows aged off `dated` because `posted_on` was never filled. */
    datedFallback: number;
    oldestDays: number | null;
    buckets: AgeingBucket[];
  };
};

const AGEING_LABELS: Record<AgeingBucketKey, string> = {
  "0-7": "Up to 7 days",
  "8-15": "8–15 days",
  "16-30": "16–30 days",
  "30+": "Over 30 days",
};

export async function getSpeedReport(
  range?: ReportRange,
): Promise<SpeedReport> {
  // `received_at` is timestamptz and `posted_on` is a date; subtracting two
  // dates yields a plain integer of days, which is what the screen wants. Going
  // via the timestamp instead would give a fractional interval whose value
  // depends on the server's timezone.
  const transitDays = sql`(${returns.receivedAt}::date - ${returns.postedOn})`;
  const datesPresent = sql`${returns.status} = 'received' and ${returns.receivedAt} is not null and ${returns.postedOn} is not null`;
  const measurable = sql`${datesPresent} and ${transitDays} >= 0`;

  // Pending is `posted` — the enum value every screen labels "Pending".
  const isPending = sql`${returns.status} = 'posted'`;
  const pendingAge = sql`(current_date - coalesce(${returns.postedOn}, ${returns.dated}))`;
  const bucket = (cond: SQL) => sql`${isPending} and ${cond}`;

  const [row] = await goodsReturnDb
    .select({
      receivedTotal: sql<number>`count(*) filter (where ${returns.status} = 'received')::int`,
      measured: sql<number>`count(*) filter (where ${measurable})::int`,
      missingDates: sql<number>`count(*) filter (where ${returns.status} = 'received' and (${returns.receivedAt} is null or ${returns.postedOn} is null))::int`,
      negativeInterval: sql<number>`count(*) filter (where ${datesPresent} and ${transitDays} < 0)::int`,
      // avg() over integers returns numeric, so the ::float8 is load-bearing.
      // No coalesce anywhere in this block: null means "not measurable".
      avgDays: sql<number | null>`(avg(${transitDays}) filter (where ${measurable}))::float8`,
      medianDays: sql<
        number | null
      >`(percentile_cont(0.5) within group (order by ${transitDays}) filter (where ${measurable}))::float8`,
      fastestDays: sql<number | null>`(min(${transitDays}) filter (where ${measurable}))::int`,
      slowestDays: sql<number | null>`(max(${transitDays}) filter (where ${measurable}))::int`,

      pendingTotal: sql<number>`count(*) filter (where ${isPending})::int`,
      datedFallback: sql<number>`count(*) filter (where ${isPending} and ${returns.postedOn} is null)::int`,
      oldestDays: sql<number | null>`(max(${pendingAge}) filter (where ${isPending}))::int`,

      // `<= 7` deliberately swallows a negative age too: a pending return dated
      // in the future is "fresh", and inventing a fifth bucket for a typo would
      // put a permanent empty column on the screen.
      b0: sql<number>`count(*) filter (where ${bucket(sql`${pendingAge} <= 7`)})::int`,
      b0v: sql<number>`coalesce(sum(${returns.totalValue}) filter (where ${bucket(sql`${pendingAge} <= 7`)}), 0)::float8`,
      b1: sql<number>`count(*) filter (where ${bucket(sql`${pendingAge} between 8 and 15`)})::int`,
      b1v: sql<number>`coalesce(sum(${returns.totalValue}) filter (where ${bucket(sql`${pendingAge} between 8 and 15`)}), 0)::float8`,
      b2: sql<number>`count(*) filter (where ${bucket(sql`${pendingAge} between 16 and 30`)})::int`,
      b2v: sql<number>`coalesce(sum(${returns.totalValue}) filter (where ${bucket(sql`${pendingAge} between 16 and 30`)}), 0)::float8`,
      b3: sql<number>`count(*) filter (where ${bucket(sql`${pendingAge} > 30`)})::int`,
      b3v: sql<number>`coalesce(sum(${returns.totalValue}) filter (where ${bucket(sql`${pendingAge} > 30`)}), 0)::float8`,
    })
    .from(returns)
    .where(rangeWhere(range));

  const mkBucket = (
    key: AgeingBucketKey,
    n: unknown,
    value: unknown,
  ): AgeingBucket => ({
    bucket: key,
    label: AGEING_LABELS[key],
    n: toNumber(n),
    value: round2(toNumber(value)),
  });

  const avgDays = toNumberOrNull(row?.avgDays);

  return {
    received: {
      total: toNumber(row?.receivedTotal),
      measured: toNumber(row?.measured),
      missingDates: toNumber(row?.missingDates),
      negativeInterval: toNumber(row?.negativeInterval),
      avgDays: avgDays === null ? null : round2(avgDays),
      medianDays: toNumberOrNull(row?.medianDays),
      fastestDays: toNumberOrNull(row?.fastestDays),
      slowestDays: toNumberOrNull(row?.slowestDays),
    },
    pending: {
      total: toNumber(row?.pendingTotal),
      datedFallback: toNumber(row?.datedFallback),
      oldestDays: toNumberOrNull(row?.oldestDays),
      buckets: [
        mkBucket("0-7", row?.b0, row?.b0v),
        mkBucket("8-15", row?.b1, row?.b1v),
        mkBucket("16-30", row?.b2, row?.b2v),
        mkBucket("30+", row?.b3, row?.b3v),
      ],
    },
  };
}

// ─── 3. WHO / WHY ──────────────────────────────────────────────────────────

export type EntityAgg = {
  id: number;
  name: string;
  returns: number;
  value: number;
  /** Returns in this group with no `total_value`; `value` is short by them. */
  valueMissing: number;
  pending: number;
  received: number;
  /** Share of the range's total billing value, or `null` if that total is 0. */
  shareOfValue: number | null;
};

/**
 * Ranked two ways because they disagree and the disagreement is the point: the
 * party sending back the most CONSIGNMENTS is rarely the one sending back the
 * most MONEY, and a single top-10 has to pick one and hide the other. The
 * original's `order by n desc, value desc limit 10` only ever showed the first.
 */
export type EntityRanking = {
  /** Distinct parties/brokers appearing in the range, not the master-list size. */
  distinct: number;
  topByCount: EntityAgg[];
  topByValue: EntityAgg[];
};

/**
 * `parties` and `brokers` are the same two columns and produce the same report,
 * so one implementation serves both. Every return carries a NOT NULL
 * `party_id` and `broker_id`, which is why these are inner joins — there is no
 * "unattributed" group to lose.
 */
async function rankEntities(
  master: typeof parties | typeof brokers,
  fk: typeof returns.partyId | typeof returns.brokerId,
  range: ReportRange | undefined,
  topN: number,
): Promise<EntityRanking> {
  // Every group is fetched, not a `limit ${topN}` — at most 212 parties and 81
  // brokers appear across all 341 returns, so the whole grouping is smaller
  // than two pages of results. Having it in memory is what lets both orderings
  // and the share-of-value denominator come out of ONE query instead of three.
  const rows = await goodsReturnDb
    .select({
      id: sql<number>`${master.id}::int`,
      name: sql<string>`${master.name}`,
      returns: sql<number>`count(*)::int`,
      value: sql<number>`coalesce(sum(${returns.totalValue}), 0)::float8`,
      valueMissing: sql<number>`count(*) filter (where ${returns.totalValue} is null)::int`,
      pending: sql<number>`count(*) filter (where ${returns.status} = 'posted')::int`,
      received: sql<number>`count(*) filter (where ${returns.status} = 'received')::int`,
    })
    .from(returns)
    .innerJoin(master, eq(fk, master.id))
    .where(rangeWhere(range))
    .groupBy(master.id, master.name);

  const totalValue = rows.reduce((sum, r) => sum + toNumber(r.value), 0);

  const aggs: EntityAgg[] = rows.map((r) => {
    const value = round2(toNumber(r.value));
    return {
      id: toNumber(r.id),
      name: r.name,
      returns: toNumber(r.returns),
      value,
      valueMissing: toNumber(r.valueMissing),
      pending: toNumber(r.pending),
      received: toNumber(r.received),
      shareOfValue: totalValue === 0 ? null : round2((value / totalValue) * 100),
    };
  });

  return {
    distinct: aggs.length,
    topByCount: [...aggs]
      .sort((a, b) => b.returns - a.returns || b.value - a.value)
      .slice(0, topN),
    topByValue: [...aggs]
      .sort((a, b) => b.value - a.value || b.returns - a.returns)
      .slice(0, topN),
  };
}

export function getPartyRanking(
  range?: ReportRange,
  topN = 10,
): Promise<EntityRanking> {
  return rankEntities(parties, returns.partyId, range, topN);
}

export function getBrokerRanking(
  range?: ReportRange,
  topN = 10,
): Promise<EntityRanking> {
  return rankEntities(brokers, returns.brokerId, range, topN);
}

export type ReasonAgg = {
  reason: string;
  n: number;
  value: number;
  valueMissing: number;
  pending: number;
  received: number;
  shareOfCount: number | null;
  shareOfValue: number | null;
};

/**
 * Grouped on `return_reason` only. `custom_reason` is free text written when the
 * reason is "Other" — it is a note, not a category, and grouping on it would
 * turn every differently-typed sentence into its own row.
 */
export async function getReasonBreakdown(
  range?: ReportRange,
): Promise<ReasonAgg[]> {
  const rows = await goodsReturnDb
    .select({
      reason: returns.returnReason,
      n: sql<number>`count(*)::int`,
      value: sql<number>`coalesce(sum(${returns.totalValue}), 0)::float8`,
      valueMissing: sql<number>`count(*) filter (where ${returns.totalValue} is null)::int`,
      pending: sql<number>`count(*) filter (where ${returns.status} = 'posted')::int`,
      received: sql<number>`count(*) filter (where ${returns.status} = 'received')::int`,
    })
    .from(returns)
    .where(rangeWhere(range))
    .groupBy(returns.returnReason)
    .orderBy(sql`count(*) desc`);

  const totalN = rows.reduce((sum, r) => sum + toNumber(r.n), 0);
  const totalValue = rows.reduce((sum, r) => sum + toNumber(r.value), 0);

  return rows.map((r) => {
    const n = toNumber(r.n);
    const value = round2(toNumber(r.value));
    return {
      reason: r.reason,
      n,
      value,
      valueMissing: toNumber(r.valueMissing),
      pending: toNumber(r.pending),
      received: toNumber(r.received),
      shareOfCount: totalN === 0 ? null : round2((n / totalN) * 100),
      shareOfValue: totalValue === 0 ? null : round2((value / totalValue) * 100),
    };
  });
}

// ─── 4. FABRIC ─────────────────────────────────────────────────────────────

export type QualityAgg = {
  quality: string;
  lines: number;
  returns: number;
  /** Total metres. `null` when no line in this group recorded a quantity. */
  metres: number | null;
  /** Total pieces. `null` when no line in this group recorded one. */
  pieces: number | null;
  linesWithoutMetres: number;
  linesWithoutPieces: number;
};

export type FabricReport = {
  distinctQualities: number;
  lines: number;
  /**
   * Lines with neither a snapshot name nor a joinable master row. Zero today,
   * but both columns are nullable, so these are counted out rather than
   * silently grouped together under an empty label.
   */
  unnamedLines: number;
  linesWithoutMetres: number;
  /**
   * 175 of 391 live lines record no pieces. `topByPieces` is a ranking over the
   * rest, and this number is what stops it being read as the whole picture.
   */
  linesWithoutPieces: number;
  totalMetres: number | null;
  totalPieces: number | null;
  topByMetres: QualityAgg[];
  topByPieces: QualityAgg[];
};

/**
 * The first report this module has ever had on the quality lines.
 *
 * Grouped on `coalesce(quality_name, qualities.name)` — never on either alone.
 * `quality_name` is the snapshot taken at entry and carries the values that had
 * no master row when the data came off the original spreadsheet; the join
 * covers rows where only the id was set. Grouping on `quality_id` would drop
 * every spreadsheet-era line into one null bucket.
 */
export async function getFabricReport(
  range?: ReportRange,
  topN = 10,
): Promise<FabricReport> {
  const qualityName = sql<
    string | null
  >`coalesce(${returnItems.qualityName}, ${qualities.name})`;

  const rows = await goodsReturnDb
    .select({
      quality: qualityName,
      lines: sql<number>`count(*)::int`,
      returns: sql<number>`count(distinct ${returnItems.returnId})::int`,
      // No coalesce: an all-null group must stay null. `quantity` is
      // numeric(14,3) so ::float8 is required; sum(pieces) is bigint so ::int.
      metres: sql<number | null>`sum(${returnItems.quantity})::float8`,
      pieces: sql<number | null>`sum(${returnItems.pieces})::int`,
      linesWithoutMetres: sql<number>`count(*) filter (where ${returnItems.quantity} is null)::int`,
      linesWithoutPieces: sql<number>`count(*) filter (where ${returnItems.pieces} is null)::int`,
    })
    .from(returnItems)
    // Inner join so the date range applies to the line's parent return.
    .innerJoin(returns, eq(returns.id, returnItems.returnId))
    .leftJoin(qualities, eq(qualities.id, returnItems.qualityId))
    .where(rangeWhere(range))
    .groupBy(sql`1`);

  let unnamedLines = 0;
  const named: QualityAgg[] = [];

  for (const r of rows) {
    const lines = toNumber(r.lines);
    if (r.quality === null) {
      // Counted, then dropped from the rankings — an unnamed group cannot be
      // labelled on a chart, and inventing "(unknown)" would rank a bucket that
      // is really several different fabrics.
      unnamedLines += lines;
      continue;
    }
    const metres = toNumberOrNull(r.metres);
    named.push({
      quality: r.quality,
      lines,
      returns: toNumber(r.returns),
      metres: metres === null ? null : round3(metres),
      pieces: toNumberOrNull(r.pieces),
      linesWithoutMetres: toNumber(r.linesWithoutMetres),
      linesWithoutPieces: toNumber(r.linesWithoutPieces),
    });
  }

  // `null` sorts last in both rankings: a quality with no recorded metres is
  // unmeasured, not zero, and must not sit at the bottom as though it were.
  const desc = (a: number | null, b: number | null) => {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
  };

  const sumOrNull = (pick: (q: QualityAgg) => number | null) => {
    const present = named.filter((q) => pick(q) !== null);
    if (present.length === 0) return null;
    return present.reduce((sum, q) => sum + (pick(q) as number), 0);
  };

  const totalMetres = sumOrNull((q) => q.metres);

  return {
    distinctQualities: named.length,
    lines: rows.reduce((sum, r) => sum + toNumber(r.lines), 0),
    unnamedLines,
    linesWithoutMetres: named.reduce((s, q) => s + q.linesWithoutMetres, 0),
    linesWithoutPieces: named.reduce((s, q) => s + q.linesWithoutPieces, 0),
    totalMetres: totalMetres === null ? null : round3(totalMetres),
    totalPieces: sumOrNull((q) => q.pieces),
    topByMetres: [...named]
      .sort((a, b) => desc(a.metres, b.metres) || b.lines - a.lines)
      .slice(0, topN),
    topByPieces: [...named]
      .sort((a, b) => desc(a.pieces, b.pieces) || b.lines - a.lines)
      .slice(0, topN),
  };
}

// ─── 5. TREND ──────────────────────────────────────────────────────────────

export type TrendMonth = {
  /** `YYYY-MM`. */
  month: string;
  n: number;
  value: number;
  valueMissing: number;
  pending: number;
  received: number;
  /** `YYYY-MM`, twelve months earlier. */
  priorMonth: string;
  /** `null` when that month has no returns recorded at all — see below. */
  priorN: number | null;
  priorValue: number | null;
  changeCountPct: number | null;
  changeValuePct: number | null;
};

export type TrendReport = {
  months: TrendMonth[];
  /** Months in the series with a year-earlier month to compare against. */
  comparableMonths: number;
};

/**
 * Newest month first.
 *
 * ── WHY `priorN` IS NULL AND NEVER 0 ──────────────────────────────────────
 *
 * A month a year back with no rows could mean "no returns that month" or "the
 * system was not recording yet", and the two read completely differently on a
 * screen. The usual way to tell them apart is `min(dated)` — everything after
 * the first recorded return is a real zero. That does not work here: the
 * earliest `dated` in the live table is **2000-01-01**, a single sentinel row,
 * while real entry starts in Dec 2024. Using it would certify "0 returns in
 * March 2023" as a measurement when nothing was being recorded at all.
 *
 * So the weaker, true claim is the one made: a comparison is offered only where
 * the year-earlier month actually has returns in it, and is `null` otherwise.
 * `comparableMonths` tells the screen how much of the series that covers.
 */
export async function getTrendReport(
  range?: ReportRange,
  months = 24,
): Promise<TrendReport> {
  // The lower bound is widened by a year so the comparators are in the same
  // result set — they sit OUTSIDE the requested range by definition, so a
  // plain `rangeWhere` would return a series with nothing to compare against.
  // The shift is done in SQL because Postgres resolves 29 Feb correctly
  // (2024-02-29 - 1 year = 2023-02-28), which string arithmetic does not.
  const conds: SQL[] = [];
  if (range?.from) {
    conds.push(
      sql`${returns.dated} >= (${range.from}::date - interval '1 year')`,
    );
  }
  if (range?.to) conds.push(lte(returns.dated, range.to));

  const rows = await goodsReturnDb
    .select({
      month: sql<string>`to_char(date_trunc('month', ${returns.dated}), 'YYYY-MM')`,
      n: sql<number>`count(*)::int`,
      value: sql<number>`coalesce(sum(${returns.totalValue}), 0)::float8`,
      valueMissing: sql<number>`count(*) filter (where ${returns.totalValue} is null)::int`,
      pending: sql<number>`count(*) filter (where ${returns.status} = 'posted')::int`,
      received: sql<number>`count(*) filter (where ${returns.status} = 'received')::int`,
    })
    .from(returns)
    .where(conds.length ? and(...conds) : undefined)
    .groupBy(sql`1`)
    .orderBy(sql`1 desc`);

  // Only months that exist become rows — the series is NOT gap-filled. With a
  // sentinel row in 2000 and real data starting Dec 2024, filling every month
  // between would put 290 zero-returns months on a chart that has 24 real ones.
  const byMonth = new Map(rows.map((r) => [r.month, r]));

  const fromMonth = range?.from ? range.from.slice(0, 7) : null;
  const toMonth = range?.to ? range.to.slice(0, 7) : null;

  const series = rows
    .filter(
      (r) =>
        (!fromMonth || r.month >= fromMonth) && (!toMonth || r.month <= toMonth),
    )
    .slice(0, months);

  let comparableMonths = 0;

  const out: TrendMonth[] = series.map((r) => {
    const [year, month] = r.month.split("-");
    const priorMonth = `${Number(year) - 1}-${month}`;
    const prior = byMonth.get(priorMonth);
    if (prior) comparableMonths += 1;

    const n = toNumber(r.n);
    const value = round2(toNumber(r.value));
    const priorN = prior ? toNumber(prior.n) : null;
    const priorValue = prior ? round2(toNumber(prior.value)) : null;

    return {
      month: r.month,
      n,
      value,
      valueMissing: toNumber(r.valueMissing),
      pending: toNumber(r.pending),
      received: toNumber(r.received),
      priorMonth,
      priorN,
      priorValue,
      changeCountPct: changePct(n, priorN),
      changeValuePct: changePct(value, priorValue),
    };
  });

  return { months: out, comparableMonths };
}

// ─── the whole report ──────────────────────────────────────────────────────

export type GoodsReturnReport = {
  range: { from: string | null; to: string | null };
  money: MoneySummary;
  speed: SpeedReport;
  parties: EntityRanking;
  brokers: EntityRanking;
  reasons: ReasonAgg[];
  fabric: FabricReport;
  trend: TrendReport;
};

/**
 * Everything one Reports screen needs, in SEVEN sequential queries.
 *
 * The `await` on every line is the whole point — see the pool note at the top
 * of this file before changing the shape of this function. `Promise.all` here
 * would hang the request, not slow it down.
 */
export async function getGoodsReturnReport(
  range?: ReportRange,
  opts?: { topN?: number; months?: number },
): Promise<GoodsReturnReport> {
  const topN = opts?.topN ?? 10;

  const money = await getMoneySummary(range);
  const speed = await getSpeedReport(range);
  const partyRanking = await getPartyRanking(range, topN);
  const brokerRanking = await getBrokerRanking(range, topN);
  const reasons = await getReasonBreakdown(range);
  const fabric = await getFabricReport(range, topN);
  const trend = await getTrendReport(range, opts?.months ?? 24);

  return {
    range: { from: range?.from ?? null, to: range?.to ?? null },
    money,
    speed,
    parties: partyRanking,
    brokers: brokerRanking,
    reasons,
    fabric,
    trend,
  };
}
