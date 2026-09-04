import type { Metadata } from "next";

import { Reveal } from "@/components/ui/reveal";
import { getGoodsReturnReport } from "@/lib/goods-return/reports";
import { MoneyCell, QtyCell } from "../money-cell";
import { OfficeBar } from "../office-bar";
import { RangePicker } from "./range-picker";
import { Bars, Figure, NotMeasurable, Note, Section } from "./parts";

export const metadata: Metadata = {
  title: "Goods Return reports — LD Silk Mills ERP",
};

const rupees = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pct = (n: number | null) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

/** "1 day", "62 days" — never "1 days", and never 62.48 for a mean of days. */
const days = (n: number | null) => {
  if (n == null) return null;
  const r = Math.round(n * 10) / 10;
  return `${r % 1 === 0 ? r.toFixed(0) : r.toFixed(1)} ${r === 1 ? "day" : "days"}`;
};

const monthName = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
};

const TH =
  "border-b border-border px-3.5 pt-3 pb-2.5 text-[11px] font-bold tracking-[0.04em] text-text-1 uppercase";
const TD = "border-b border-border px-3.5 py-2.5";

/**
 * Reports.
 *
 * The standalone app has four flat counts here — by status, by reason, top ten
 * parties, by month — which answer "how many" and nothing else. This is a
 * rewrite around the questions somebody actually asks about returned goods:
 * what did they cost, how long are they taking, who and why, and which fabric.
 *
 * ── EVERY FIGURE CARRIES ITS COVERAGE ────────────────────────────────────
 *
 * Measured against the live data before this was designed: the average transit
 * time can only be computed from 98 of 277 received returns, the billing total
 * excludes 26 with no amount, and 175 of 391 quality lines record no pieces. A
 * report that prints those as round numbers is a report somebody quotes in a
 * meeting as the whole picture. So each figure states what it is built from,
 * and anything genuinely uncomputable says "Not measurable" instead of 0.
 *
 * ONE query call, seven statements, sequential inside it. See the pool note in
 * reports.ts — `Promise.all` there hangs the request rather than speeding it up.
 */
export default async function GoodsReturnReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const range = { from: one("from") || undefined, to: one("to") || undefined };

  const rep = await getGoodsReturnReport(range);
  const { money, speed, parties, brokers, reasons, fabric, trend } = rep;
  const tv = money.transportVariance;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
            Reports
          </h1>
          <p className="mt-1 hidden text-[13px] text-text-3 sm:block">
            What returns cost, how long they take, and who they come from.
          </p>
          <div className="mt-2">
            <OfficeBar />
          </div>
        </div>
        <RangePicker />
      </div>

      {/* ── 1 · money ─────────────────────────────────────────────────── */}
      <Reveal index={0}>
        <Section
          title="What returns cost"
          lede={`${money.returns.toLocaleString("en-IN")} returns in this range.`}
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 p-4 lg:grid-cols-4">
            <Figure
              label="Billing value"
              value={rupees(money.billingValue)}
              caveat={
                money.billingValueMissing > 0
                  ? `${money.billingValueMissing} returns have no amount recorded`
                  : "every return has an amount"
              }
            />
            <Figure
              label="Transport expected"
              value={rupees(money.transportExpected)}
              caveat={
                money.transportExpectedMissing > 0
                  ? `${money.transportExpectedMissing} not recorded`
                  : undefined
              }
            />
            <Figure
              label="Bhiwandi paid"
              value={rupees(money.totalBhiwandiPaid)}
              caveat="transport + charges entered on arrival"
            />
            <Figure
              label="Total outlay"
              value={rupees(money.totalExpectedOutlay)}
              caveat="billing + head-office charges"
            />
          </div>

          <div className="border-t border-border p-4">
            {tv == null ? (
              <Note>
                No return in this range has both an expected and an actual
                transport figure, so there is nothing to compare.
              </Note>
            ) : tv.differing === 0 ? (
              <Note tone="warn">
                <strong>The actual transport figure is not being entered.</strong>{" "}
                All {tv.comparable} returns where both numbers exist have them{" "}
                <em>identical</em> — Bhiwandi&apos;s figure is a copy of what Head
                Office expected, not what was paid at the lorry. Until that
                changes, expected-versus-actual cannot tell you anything.{" "}
                {tv.awaitingActual > 0 && (
                  <>A further {tv.awaitingActual} are still awaiting an actual.</>
                )}
              </Note>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
                <Figure
                  label="Expected"
                  value={rupees(tv.expected)}
                  caveat={`across ${tv.comparable} comparable returns`}
                />
                <Figure label="Actually paid" value={rupees(tv.actual)} />
                <Figure
                  label="Difference"
                  value={rupees(tv.variance)}
                  tone={tv.variance > 0 ? "bad" : tv.variance < 0 ? "good" : undefined}
                  caveat={
                    tv.variancePct != null ? pct(tv.variancePct) : undefined
                  }
                />
                <Figure
                  label="Over / under"
                  value={`${tv.overpaid} / ${tv.underpaid}`}
                  caveat={`${tv.matched} matched exactly`}
                />
              </div>
            )}
          </div>
        </Section>
      </Reveal>

      {/* ── 2 · speed ─────────────────────────────────────────────────── */}
      <Reveal index={1}>
        <Section
          title="How long goods take"
          lede="From the day a return is posted to Bhiwandi to the day it is marked received."
        >
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <Figure
                label="Average"
                value={
                  speed.received.avgDays == null ? (
                    <NotMeasurable reason="no usable pairs of dates" />
                  ) : (
                    days(speed.received.avgDays)
                  )
                }
                caveat={`from ${speed.received.measured} of ${speed.received.total} received`}
              />
              <Figure
                label="Median"
                value={
                  days(speed.received.medianDays) ?? "—"
                }
              />
              <Figure
                label="Fastest"
                value={
                  days(speed.received.fastestDays) ?? "—"
                }
                tone="good"
              />
              <Figure
                label="Slowest"
                value={
                  days(speed.received.slowestDays) ?? "—"
                }
                tone="warn"
              />
            </div>

            <div className="flex flex-col gap-3">
              <div className="text-[12.5px] font-semibold text-text-1">
                Still waiting ({speed.pending.total})
              </div>
              <Bars
                tone="amber"
                rows={speed.pending.buckets.map((b) => ({
                  key: b.bucket,
                  label: b.label,
                  n: b.n,
                  sub: b.value > 0 ? rupees(b.value) : undefined,
                }))}
              />
            </div>
          </div>

          {(speed.received.missingDates > 0 ||
            speed.received.negativeInterval > 0) && (
            <div className="border-t border-border p-4">
              <Note tone="warn">
                {speed.received.missingDates > 0 && (
                  <>
                    <strong>{speed.received.missingDates}</strong> received
                    returns are missing a posted or received date.{" "}
                  </>
                )}
                {speed.received.negativeInterval > 0 && (
                  <>
                    <strong>{speed.received.negativeInterval}</strong> record
                    arrival <em>before</em> dispatch — receiving is done in
                    batches, so one date covers a pile of returns posted on
                    different days. Both groups are left out of the average
                    rather than smoothed into it.
                  </>
                )}
              </Note>
            </div>
          )}
        </Section>
      </Reveal>

      {/* ── 3 · who ───────────────────────────────────────────────────── */}
      <Reveal index={2}>
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            { title: "Parties", data: parties, noun: "parties" },
            { title: "Brokers", data: brokers, noun: "brokers" },
          ].map(({ title, data, noun }) => (
            <Section
              key={title}
              title={title}
              lede={`${data.distinct} ${noun} appear in this range.`}
            >
              <div className="grid gap-0 sm:grid-cols-2">
                {[
                  { head: "Most returns", rows: data.topByCount, byValue: false },
                  { head: "Most value", rows: data.topByValue, byValue: true },
                ].map(({ head, rows, byValue }) => (
                  <div
                    key={head}
                    className="border-b border-border p-4 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
                  >
                    <div className="mb-2.5 text-[11px] font-bold tracking-[0.04em] text-text-3 uppercase">
                      {head}
                    </div>
                    <ol className="flex flex-col gap-2">
                      {rows.slice(0, 6).map((r) => (
                        <li
                          key={r.id}
                          className="flex items-baseline justify-between gap-3"
                        >
                          <span className="truncate text-[12.5px] text-text-1">
                            {r.name}
                          </span>
                          <span className="num shrink-0 text-[12.5px] font-semibold text-text-1">
                            {byValue
                              ? rupees(r.value)
                              : `${r.returns} ${r.returns === 1 ? "return" : "returns"}`}
                          </span>
                        </li>
                      ))}
                      {rows.length === 0 && (
                        <li className="text-[12.5px] text-text-3">Nothing yet.</li>
                      )}
                    </ol>
                  </div>
                ))}
              </div>
            </Section>
          ))}
        </div>
      </Reveal>

      {/* ── 4 · why ───────────────────────────────────────────────────── */}
      <Reveal index={3}>
        <Section
          title="Why goods come back"
          lede="Grouped on the reason chosen at entry."
        >
          <div className="p-4">
            <Bars
              rows={reasons.map((r) => ({
                key: r.reason,
                label: r.reason,
                n: r.n,
                sub: (
                  <>
                    {rupees(r.value)}
                    {r.valueMissing > 0 && (
                      <> · {r.valueMissing} with no amount</>
                    )}
                    {r.shareOfCount != null && (
                      <> · {r.shareOfCount.toFixed(0)}% of returns</>
                    )}
                  </>
                ),
              }))}
            />
          </div>
        </Section>
      </Reveal>

      {/* ── 5 · fabric ────────────────────────────────────────────────── */}
      <Reveal index={4}>
        <Section
          title="Which fabric comes back"
          lede={`${fabric.distinctQualities} qualities across ${fabric.lines} lines — the first report this module has had on the quality lines.`}
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-b border-border p-4 sm:grid-cols-4">
            <Figure
              label="Total metres"
              value={
                fabric.totalMetres == null ? (
                  <NotMeasurable reason="none recorded" />
                ) : (
                  fabric.totalMetres.toLocaleString("en-IN", {
                    maximumFractionDigits: 1,
                  })
                )
              }
              caveat={
                fabric.linesWithoutMetres > 0
                  ? `${fabric.linesWithoutMetres} lines have no quantity`
                  : undefined
              }
            />
            <Figure
              label="Total pieces"
              value={
                fabric.totalPieces == null ? (
                  <NotMeasurable reason="none recorded" />
                ) : (
                  fabric.totalPieces.toLocaleString("en-IN")
                )
              }
              caveat={
                fabric.linesWithoutPieces > 0
                  ? `${fabric.linesWithoutPieces} of ${fabric.lines} lines have no piece count`
                  : undefined
              }
            />
            <Figure label="Qualities" value={fabric.distinctQualities} />
            <Figure label="Lines" value={fabric.lines} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={`${TH} text-left`}>Quality</th>
                  <th className={`${TH} text-right`}>Returns</th>
                  <th className={`${TH} text-right`}>Metres</th>
                  <th className={`${TH} text-right`}>Pieces</th>
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {fabric.topByMetres.slice(0, 10).map((q) => (
                  <tr key={q.quality} className="hover:bg-surface-2">
                    <td className={`${TD} font-medium text-text-1`}>
                      {q.quality}
                    </td>
                    <td className={`${TD} num text-right text-text-2`}>
                      {q.returns}
                    </td>
                    <td className={`${TD} text-right`}>
                      <QtyCell value={q.metres} className="text-text-1" />
                    </td>
                    <td className={`${TD} text-right`}>
                      <QtyCell value={q.pieces} className="text-text-2" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </Reveal>

      {/* ── 6 · trend ─────────────────────────────────────────────────── */}
      <Reveal index={5}>
        <Section
          title="Month by month"
          lede={
            trend.comparableMonths > 0
              ? `${trend.comparableMonths} of ${trend.months.length} months have the same month a year earlier to compare against.`
              : "No month yet has a year-earlier month to compare against."
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={`${TH} text-left`}>Month</th>
                  <th className={`${TH} text-right`}>Returns</th>
                  <th className={`${TH} text-right`}>Value</th>
                  <th className={`${TH} text-right`}>Pending</th>
                  <th className={`${TH} text-right`}>vs last year</th>
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {trend.months.map((m) => (
                  <tr key={m.month} className="hover:bg-surface-2">
                    <td className={`${TD} num font-medium text-text-1`}>
                      {monthName(m.month)}
                    </td>
                    <td className={`${TD} num text-right text-text-1`}>{m.n}</td>
                    <td className={`${TD} text-right`}>
                      <MoneyCell value={m.value} className="text-text-1" />
                    </td>
                    <td className={`${TD} num text-right text-text-3`}>
                      {m.pending || "—"}
                    </td>
                    <td className={`${TD} num text-right`}>
                      {m.changeCountPct == null ? (
                        <span className="text-text-3">no data</span>
                      ) : (
                        <span
                          className={
                            m.changeCountPct > 0
                              ? "text-status-red"
                              : m.changeCountPct < 0
                                ? "text-status-green"
                                : "text-text-3"
                          }
                        >
                          {pct(m.changeCountPct)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </Reveal>
    </div>
  );
}
