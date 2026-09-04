import type { Metadata } from "next";
import Link from "next/link";
import {
  IconArrowRight,
  IconClipboardList,
  IconCoin,
  IconPackage,
  IconPlus,
  IconTruckDelivery,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { Reveal } from "@/components/ui/reveal";
import { StatCard } from "@/components/ui/stat-card";
import { canCreateReturns, getChosenOffice } from "@/lib/goods-return/authz";
import { getTrendReport } from "@/lib/goods-return/reports";
import {
  getReturnStats,
  getReturnsList,
} from "@/lib/goods-return/returns-query";
import { MoneyCell } from "./money-cell";
import { OfficeBar } from "./office-bar";
import { ReturnsChart } from "./returns-chart";
import { StatusPill } from "./status-pill";

export const metadata: Metadata = {
  title: "Goods Return — LD Silk Mills ERP",
};

const shortDate = (d: string) =>
  new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/**
 * The Goods Return dashboard.
 *
 * THREE queries, awaited in sequence rather than raced. The pool is five
 * connections, and the standalone app wedged itself on this exact page by
 * running seven at once — the note it left behind is reproduced in
 * `src/db/goods-return/index.ts`. Three sequential aggregates over an indexed
 * 341-row table cost a few milliseconds with the functions in the database
 * region, which is what `vercel.json` pins.
 */
export default async function GoodsReturnDashboard() {
  const office = await getChosenOffice();
  const stats = await getReturnStats();
  const trend = await getTrendReport(undefined, 12);
  const recent = await getReturnsList({ page: 1, pageSize: 6 });

  const canCreate = office ? canCreateReturns(office) : false;
  // Oldest first, so the chart reads left to right. The report hands back
  // newest first because every other consumer wants it that way.
  const chart = [...trend.months]
    .reverse()
    .map((m) => ({ month: m.month, n: m.n }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
            Goods Return
          </h1>
          <p className="mt-1 hidden text-[13px] text-text-3 sm:block">
            Returns going back to parties, and what arrives at Bhiwandi.
          </p>
          <div className="mt-2">
            <OfficeBar />
          </div>
        </div>
        {canCreate && (
          <Button
            size="sm"
            className="h-9"
            nativeButton={false}
            render={<Link href="/goods-return/returns/new" />}
          >
            <IconPlus className="size-4" /> New return
          </Button>
        )}
      </div>

      <Reveal index={0}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={<IconClipboardList className="size-4" />}
            label="Total returns"
            value={stats.total}
          />
          <StatCard
            icon={<IconTruckDelivery className="size-4" />}
            label="Awaiting receipt"
            value={stats.posted}
            sub="Pending at Bhiwandi"
            tone="warning"
            valueTone={stats.posted > 0 ? "warning" : undefined}
          />
          <StatCard
            icon={<IconPackage className="size-4" />}
            label="Received"
            value={stats.received}
            tone="success"
          />
          <StatCard
            icon={<IconCoin className="size-4" />}
            label="Total billing value"
            value={<Money value={Number(stats.totalValue ?? 0)} />}
            sub={`Across all ${stats.total} returns`}
          />
        </div>
      </Reveal>

      <Reveal index={1}>
        <section className="rounded-card border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-[14.5px] font-bold text-text-1">
                Returns by month
              </h2>
              <p className="text-[12px] text-text-3">
                Last {chart.length} months, by the date on the return.
              </p>
            </div>
            <Link
              href="/goods-return/reports"
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent-text hover:underline"
            >
              Reports <IconArrowRight className="size-3.5" />
            </Link>
          </div>
          <div className="px-2 py-3 sm:px-4">
            <ReturnsChart data={chart} />
          </div>
        </section>
      </Reveal>

      <Reveal index={2}>
        <section className="rounded-card border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="text-[14.5px] font-bold text-text-1">
              Recent returns
            </h2>
            <Link
              href="/goods-return/returns"
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent-text hover:underline"
            >
              View all <IconArrowRight className="size-3.5" />
            </Link>
          </div>

          {/* Table above sm, cards below. A five-column table on a phone
              scrolls sideways, and the LD id somebody is looking for sits in
              the column that scrolls away first. */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {["LD ID", "Date", "Party", "Total", "Status"].map((h, i) => (
                    <th
                      key={h}
                      className={`border-b border-border px-4 pt-3 pb-2.5 text-[11px] font-bold tracking-[0.04em] text-text-1 uppercase ${
                        i === 3 ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {recent.rows.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-surface-2">
                    <td className="border-b border-border px-4 py-3">
                      <Link
                        href={`/goods-return/returns/${r.id}`}
                        className="num font-semibold text-accent-text hover:underline"
                      >
                        {r.displayId}
                      </Link>
                    </td>
                    <td className="num border-b border-border px-4 py-3 text-text-2">
                      {shortDate(r.dated)}
                    </td>
                    <td className="border-b border-border px-4 py-3 text-text-1">
                      {r.partyName ?? "—"}
                    </td>
                    <td className="border-b border-border px-4 py-3 text-right">
                      <MoneyCell value={r.totalValue} className="text-text-1" />
                    </td>
                    <td className="border-b border-border px-4 py-3">
                      <StatusPill status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-border sm:hidden">
            {recent.rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/goods-return/returns/${r.id}`}
                  className="flex flex-col gap-1.5 px-4 py-3 active:bg-surface-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="num text-[13px] font-semibold text-accent-text">
                      {r.displayId}
                    </span>
                    <StatusPill status={r.status} />
                  </div>
                  <div className="text-[13px] font-medium text-text-1">
                    {r.partyName ?? "—"}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="num text-text-3">{shortDate(r.dated)}</span>
                    <MoneyCell
                      value={r.totalValue}
                      className="font-semibold text-text-1"
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </Reveal>
    </div>
  );
}
