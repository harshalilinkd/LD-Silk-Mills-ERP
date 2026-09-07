import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IconDownload, IconLock } from "@tabler/icons-react";

import { EmptyState, PageHead } from "@/components/ui/module-parts";
import { formatDate } from "@/lib/dates";
import { canRunModule, resolveReportViewer } from "@/lib/reports/authz";
import { salesDashboard } from "@/lib/reports/dashboards/order-entry";
import { count, pct } from "@/lib/reports/format";

import { ComboMonthly, CountColumns, RankedBars, SharePie } from "../dashboard-charts";
import { loadOptions, readParams } from "../dashboard-common";
import { DashboardFilters } from "../dashboard-filters";
import { Card, Caveats, HeatGrid, Insights, KpiStrip } from "../dashboard-parts";
import { ReportsTabs } from "../reports-tabs";

export const metadata: Metadata = { title: "Sales dashboard — LD Silk Mills ERP" };

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Sales dashboard
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every figure on this page comes out of `orderRegister.run()` and
 * `qualityAnalysis.run()` — the same two reports the CSV and the workbook are
 * built from, whose rows were checked against independently-written SQL. The
 * screen does no arithmetic of its own beyond grouping those verified rows, so
 * a number here and the same number in a downloaded file are the same
 * calculation, not two calculations that happen to agree today.
 *
 * The caveats printed at the foot are the report's own. They are not
 * decoration: "value excludes cancelled lines" is the difference between
 * ₹8.34 cr and ₹8.47 cr, and a dashboard that omits it is a dashboard somebody
 * reconciles against a printout and cannot make balance.
 */
export default async function SalesDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolveReportViewer();
  if (!viewer) redirect("/login");

  if (!canRunModule(viewer, "order-entry")) {
    return (
      <div className="flex flex-col gap-4">
        <PageHead eyebrow="Reports" title="Sales dashboard" />
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
  const d = await salesDashboard(q.params);
  const a = d.analysis;

  const period = `${formatDate(q.from)} to ${formatDate(q.to)}`;
  const completeShare = d.orders > 0 ? (d.completion.complete / d.orders) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        eyebrow="Reports"
        title="Sales dashboard"
        lede={a.headline ?? `Orders taken between ${period}.`}
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
        action="/reports/sales"
        from={q.from}
        to={q.to}
        party={q.party}
        agent={q.agent}
        parties={parties}
        agents={agents}
      />

      {d.orders === 0 ? (
        <EmptyState
          title="Nothing in this period"
          body="No orders were placed between these dates, or the party and agent chosen have none. Widen the dates or clear the filters."
        />
      ) : (
        <>
          <KpiStrip kpis={a.kpis} />

          <div className="grid gap-3 xl:grid-cols-3">
            <Card
              title="Order value and how many orders, month by month"
              sub={period}
              className="xl:col-span-2"
              note="Bars are what was ordered; the line is how many orders it took. A month where the line falls but the bars hold is fewer, bigger orders."
            >
              <ComboMonthly data={d.months} />
            </Card>
            <Card
              title="Where the orders have reached"
              sub={`${count(d.orders)} orders`}
              note="An order sits at the furthest stage EVERY one of its live lines has finished — one line still at stock checking holds the whole order there, which is what the customer experiences."
            >
              <SharePie
                data={d.byStage}
                money={false}
                donut
                centreValue={pct(completeShare, 0)}
                centreLabel="fully through"
              />
            </Card>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <Card
              title="Biggest customers"
              sub={`top ${d.topCustomers.length}`}
              note="By order value in this period. Cancelled lines are left out."
            >
              <RankedBars data={d.topCustomers} />
            </Card>
            <Card
              title="Which agents brought the work in"
              sub="by value"
              note="The seven biggest; everything else is added together as Others so the slices still make the full total."
            >
              <SharePie data={d.byAgent} />
            </Card>
            <Card
              title="How big the orders are"
              sub={`${count(d.orders)} orders`}
              note="How many orders fall in each size band. Five orders of a crore and five hundred of ten thousand make the same total and a completely different business."
            >
              <SharePie data={d.bySize} money={false} donut />
            </Card>
          </div>

          <Card
            title="Highest selling cloth"
            sub="by value"
            note="The ten cloths that earned most. Hover any column for the exact figure and how many lines it took."
          >
            <CountColumns data={d.topQualities} money height={300} />
          </Card>

          <div className="grid gap-3 xl:grid-cols-3">
            <Card
              title="Which sales people wrote the orders"
              sub="by value"
              className="xl:col-span-1"
            >
              <RankedBars data={d.bySalesPerson} />
            </Card>
            <Card title="Which transports carried them" sub="by value" className="xl:col-span-1">
              <RankedBars data={d.byTransport} />
            </Card>
            <Card
              title="What the numbers say"
              className="xl:col-span-1"
              note={`Money figures are of orders placed in this period, ${period.toLowerCase()}.`}
            >
              <Insights items={a.insights} />
            </Card>
          </div>

          {a.matrix && (
            <Card title={a.matrix.title} note={a.matrix.note}>
              <HeatGrid matrix={a.matrix} />
            </Card>
          )}

          <Card title="Worth knowing about these figures">
            <Caveats items={a.caveats} />
          </Card>
        </>
      )}
    </div>
  );
}
