import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IconDownload, IconLock } from "@tabler/icons-react";

import { EmptyState, PageHead, td, th } from "@/components/ui/module-parts";
import { formatDate } from "@/lib/dates";
import { canRunModule, resolveReportViewer } from "@/lib/reports/authz";
import { productionDashboard } from "@/lib/reports/dashboards/order-entry";
import { count, inr, pct, qty } from "@/lib/reports/format";

import {
  CountColumns,
  FunnelRows,
  Gauge,
  RankedBars,
} from "../dashboard-charts";
import { loadOptions, readParams } from "../dashboard-common";
import { DashboardFilters } from "../dashboard-filters";
import { Card, Caveats, Insights, KpiStrip } from "../dashboard-parts";
import { ReportsTabs } from "../reports-tabs";

export const metadata: Metadata = {
  title: "Production dashboard — LD Silk Mills ERP",
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Production dashboard
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Built entirely from `productionStatus.run()` — the same report the workbook
 * is built from. Nothing here recomputes a stage or an age.
 *
 * ── THE HONESTY THIS SCREEN HAS TO CARRY ─────────────────────────────────
 *
 * The stage timestamps record WHEN SOMEBODY PRESSED A BUTTON, and a great many
 * were pressed in bulk while a backlog was caught up. So the median
 * start-to-finish time across all finished lines is zero days, which is not a
 * fact about the mill. The report computes the honest figure beside the
 * flattering one — the lines whose stages were ticked on different days — and
 * this screen shows the honest one, with the caveat printed underneath rather
 * than buried in a tooltip.
 *
 * "Finished" means the LAST stage is ticked, never "all seven are ticked". 33
 * lines have Dispatch ticked with an earlier stage skipped; counting ticks
 * instead made one dashboard print two different numbers of open lines.
 */
export default async function ProductionDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolveReportViewer();
  if (!viewer) redirect("/login");

  if (!canRunModule(viewer, "order-entry")) {
    return (
      <div className="flex flex-col gap-4">
        <PageHead eyebrow="Reports" title="Production dashboard" />
        <ReportsTabs />
        <EmptyState
          icon={<IconLock className="size-5" />}
          title="You do not have Orders"
          body="These figures come from the Orders module. Ask an administrator to give you access in Settings → Access, and this page will fill in."
        />
      </div>
    );
  }

  const sp = await searchParams;
  const q = readParams(sp);
  const { parties, agents } = await loadOptions();
  const d = await productionDashboard(q.params);
  const a = d.analysis;

  const period = `${formatDate(q.from)} to ${formatDate(q.to)}`;
  const finished = d.total - d.open;
  const started = d.stages[0]?.done ?? 0;
  // The KPI prints an em dash when no stage has been ticked in the period.
  // Reverse-parsing that string gave NaN, and `|| 0` turned it into a
  // confident red 0% beside a KPI card that was honestly showing "—".
  const onTimeText =
    a.kpis.find((k) => k.label === "Ticked on time")?.value ?? "—";
  const onTimeParsed = Number(String(onTimeText).replace("%", ""));
  const onTime = Number.isFinite(onTimeParsed) ? onTimeParsed : null;
  const openValue = a.kpis.find((k) => k.label === "Open value")?.value ?? "—";

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        eyebrow="Reports"
        title="Production dashboard"
        lede={a.headline ?? `Lines from orders placed between ${period}.`}
        action={
          <Link
            href="/reports"
            className="inline-flex h-9 items-center gap-2 rounded-field border border-border px-3.5 text-[13px] font-medium text-text-2 transition-colors hover:text-text-1"
          >
            <IconDownload className="size-4" />
            Download the files
          </Link>
        }
      />
      <ReportsTabs />
      <DashboardFilters
        action="/reports/production"
        from={q.from}
        to={q.to}
        party={q.party}
        agent={q.agent}
        parties={parties}
        agents={agents}
      />

      {d.capped && (
        <p className="rounded-card border border-status-amber/40 bg-status-amber-dim px-4 py-3 text-[12.5px] leading-snug text-text-2">
          {d.capped}
        </p>
      )}
      {d.total === 0 ? (
        <EmptyState
          title="Nothing in this period"
          body="No live lines belong to orders placed between these dates. Widen the dates or clear the filters."
        />
      ) : (
        <>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card
              title="Where the work has got to"
              sub={`${count(d.total)} live lines`}
            >
              <FunnelRows
                rows={d.stages.map((s) => ({
                  no: s.no,
                  label: s.label,
                  done: s.done,
                  lost: s.lost,
                }))}
                total={d.total}
              />
              <p className="mt-3 text-[11.5px] leading-snug text-text-3">
                How many lines have finished each stage. The red figure is how
                many fell away since the stage above — the biggest one is the
                bottleneck.
              </p>
            </Card>
            {/* The figure tiles sit in this same column, under the gauges,
                rather than in their own full-width strip below both charts —
                everything about "how far has the work got" is one glance to
                the right of the funnel now, not a further scroll down. Two
                across, not six: six-wide is what this strip uses at full page
                width, and squeezed into 360px that would put one word per
                line on every card. */}
            <div className="flex flex-col gap-3">
              <Card title="At a glance" sub={period}>
                <div className="flex flex-col gap-4">
                  <Gauge
                    value={d.total ? (started / d.total) * 100 : 0}
                    label="Started"
                    sub={`${count(started)} of ${count(d.total)} lines have had a first tick`}
                    tone="accent"
                  />
                  <Gauge
                    value={d.total ? (finished / d.total) * 100 : 0}
                    label="Finished"
                    sub={`${count(finished)} lines through the last stage and out of the mill`}
                    tone={finished >= d.total / 2 ? "good" : "warn"}
                  />
                  <Gauge
                    value={onTime ?? 0}
                    label="Ticked on time"
                    sub={
                      onTime === null
                        ? "Nothing has been ticked in this period, so there is nothing to measure"
                        : "Stages ticked on or before their planned date — read the note at the foot"
                    }
                    tone={onTime === null ? "accent" : "bad"}
                  />
                </div>
              </Card>
              <KpiStrip
                kpis={a.kpis}
                className="grid-cols-2 sm:grid-cols-2 xl:grid-cols-2"
              />
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <Card
              title="What each open line is waiting for"
              sub={`${count(d.open)} open`}
              note="The next stage that has not been ticked. The biggest bar is where the work is queuing."
            >
              <RankedBars
                data={d.waiting}
                money={false}
                colour="var(--chart-3)"
              />
            </Card>
            <Card
              title="How long the open lines have waited"
              sub="counted from the order date"
              note="This is what the customer is experiencing, not how long the mill has had it."
            >
              <CountColumns data={d.ageing} tone="severity" height={240} />
            </Card>
            <Card
              title="Whose money is still in the mill"
              sub={openValue}
              note="The value of the lines that have not reached the last stage, by party. The final bar gathers everybody outside the top ten, so the bars add up to the figure above."
            >
              <RankedBars data={d.byParty} />
            </Card>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
            <Card
              title="Oldest open lines"
              sub={`${count(d.pending.length)} of ${count(d.pendingTotal)}`}
              note="The fifteen that have been open longest. For the whole list, download Production status and filter Still open to Yes."
            >
              <div className="-mx-1 overflow-x-auto px-1">
                <table className="w-full min-w-[720px] border-collapse">
                  <thead>
                    <tr>
                      <th className={th}>Order</th>
                      <th className={th}>Party</th>
                      <th className={th}>Fabric</th>
                      <th className={th}>Design</th>
                      <th className={`${th} text-right`}>Metres</th>
                      <th className={`${th} text-right`}>Value</th>
                      <th className={th}>Waiting on</th>
                      <th className={`${th} text-right`}>Days open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.pending.map((r) => (
                      <tr
                        key={`${r.order_no}|${r.quality}|${r.design}|${r.days_open}|${r.value}`}
                      >
                        <td className={`${td} num whitespace-nowrap`}>
                          {r.order_no}
                        </td>
                        <td
                          className={`${td} max-w-[180px] truncate`}
                          title={r.party}
                        >
                          {r.party}
                        </td>
                        <td className={td}>{r.quality}</td>
                        <td className={td}>{r.design}</td>
                        <td className={`${td} num text-right`}>
                          {qty(r.metres)}
                        </td>
                        <td className={`${td} num text-right`}>
                          {inr(r.value)}
                        </td>
                        <td className={td}>{r.waiting_on}</td>
                        <td
                          className={`${td} num text-right font-semibold text-text-1`}
                        >
                          {count(r.days_open)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card
              title="Stage by stage"
              sub={`${count(d.total)} live lines`}
              note="Days late is measured from when the stage was TICKED, not when the work happened, and it is averaged over the lines that have been ticked at all."
            >
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={th}>#</th>
                    <th className={th}>Stage</th>
                    <th className={`${th} text-right`}>Lines done</th>
                    <th className={`${th} text-right`}>Of all lines</th>
                    <th className={`${th} text-right`}>Avg days late</th>
                  </tr>
                </thead>
                <tbody>
                  {d.stages.map((s) => (
                    <tr key={s.label}>
                      <td className={`${td} num`}>{s.no}</td>
                      <td className={td}>{s.label}</td>
                      <td className={`${td} num text-right`}>
                        {count(s.done)}
                      </td>
                      <td className={`${td} num text-right`}>
                        {pct(s.pct, 0)}
                      </td>
                      <td
                        className={`${td} num text-right ${s.avgLate != null && s.avgLate > 0 ? "text-status-red" : ""}`}
                      >
                        {s.avgLate == null ? "—" : s.avgLate.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <Card
              title="What the numbers say"
              sub={`${count(d.total)} lines · ${period}`}
            >
              <Insights items={a.insights} />
            </Card>
            <Card title="Worth knowing about these figures">
              <Caveats items={a.caveats} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
