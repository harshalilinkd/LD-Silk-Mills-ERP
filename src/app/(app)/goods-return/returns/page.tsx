import type { Metadata } from "next";
import Link from "next/link";
import { IconDownload, IconPlus } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { canCreateReturns, getChosenOffice } from "@/lib/goods-return/authz";
import {
  getReturnFilterParties,
  getReturnsList,
  type ReturnStatus,
} from "@/lib/goods-return/returns-query";
import { MoneyCell } from "../money-cell";
import { OfficeBar } from "../office-bar";
import { StatusPill } from "../status-pill";
import { ReturnFilters } from "./filters";
import { ListPager } from "./pager";

export const metadata: Metadata = {
  title: "All returns — LD Silk Mills ERP",
};

const shortDate = (d: string) =>
  new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/** `?status=` is untrusted; anything else is treated as no filter at all. */
const asStatus = (v: string | undefined): ReturnStatus | undefined =>
  v === "posted" || v === "received" ? v : undefined;

const asInt = (v: string | undefined): number | undefined => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/**
 * All returns.
 *
 * A SERVER component reading the query string, not a client list on TanStack
 * Query — which diverges from the Order Entry convention deliberately. Those
 * screens need optimistic updates and live refetching; this one is a filtered
 * read of 341 rows. Rendering it on the server keeps the table out of the
 * browser as JSON, makes a filtered view a shareable link, and needs no API
 * route to exist at all.
 *
 * Two queries, awaited in sequence. The pool note in
 * `src/db/goods-return/index.ts` applies to every screen in this module.
 */
export default async function AllReturnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const filter = {
    search: one("q") || undefined,
    status: asStatus(one("status")),
    partyId: asInt(one("party")),
    reason: one("reason") || undefined,
    dateFrom: one("from") || undefined,
    dateTo: one("to") || undefined,
    page: asInt(one("page")) ?? 1,
  };

  const office = await getChosenOffice();
  const list = await getReturnsList(filter);
  const parties = await getReturnFilterParties();

  const canCreate = office ? canCreateReturns(office) : false;
  const exportQs = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) =>
      v == null || k === "page" ? [] : [[k, Array.isArray(v) ? v[0]! : v]],
    ),
  ).toString();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
            All returns
          </h1>
          <p className="mt-1 hidden text-[13px] text-text-3 sm:block">
            Every return recorded, and where each one has got to.
          </p>
          <div className="mt-2">
            <OfficeBar />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            nativeButton={false}
            render={
              <a
                href={`/goods-return/returns/export${exportQs ? `?${exportQs}` : ""}`}
              />
            }
          >
            <IconDownload className="size-4" /> Export CSV
          </Button>
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
      </div>

      <Reveal index={0}>
        <ReturnFilters parties={parties} total={list.total} />
      </Reveal>

      <Reveal index={1}>
        <section className="rounded-card border border-border bg-surface">
          {list.rows.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-4 py-14 text-center">
              <p className="text-[14px] font-semibold text-text-1">
                Nothing matches those filters
              </p>
              <p className="max-w-sm text-[13px] text-text-3">
                Try widening the dates, or clearing the filters to see all{" "}
                returns again.
              </p>
            </div>
          ) : (
            <>
              {/* Table above md — seven columns need the room. Cards below. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr>
                      {[
                        ["LD ID", "left"],
                        ["Date", "left"],
                        ["Party", "left"],
                        ["Broker", "left"],
                        ["Lines", "right"],
                        ["Reason", "left"],
                        ["Total", "right"],
                        ["Status", "left"],
                      ].map(([h, align]) => (
                        <th
                          key={h}
                          className={`border-b border-border px-3.5 pt-3 pb-2.5 text-[11px] font-bold tracking-[0.04em] text-text-1 uppercase ${
                            align === "right" ? "text-right" : "text-left"
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="[&>tr:last-child>td]:border-b-0">
                    {list.rows.map((r) => (
                      <tr
                        key={r.id}
                        className="transition-colors hover:bg-surface-2"
                      >
                        <td className="border-b border-border px-3.5 py-3">
                          <Link
                            href={`/goods-return/returns/${r.id}`}
                            className="num font-semibold text-accent-text hover:underline"
                          >
                            {r.displayId}
                          </Link>
                        </td>
                        <td className="num border-b border-border px-3.5 py-3 whitespace-nowrap text-text-2">
                          {shortDate(r.dated)}
                        </td>
                        <td className="border-b border-border px-3.5 py-3 text-text-1">
                          {r.partyName ?? "—"}
                        </td>
                        <td className="border-b border-border px-3.5 py-3 text-text-2">
                          {r.brokerName ?? "—"}
                        </td>
                        <td className="num border-b border-border px-3.5 py-3 text-right text-text-2">
                          {r.itemCount}
                        </td>
                        <td className="border-b border-border px-3.5 py-3 text-text-2">
                          {r.returnReason}
                        </td>
                        <td className="border-b border-border px-3.5 py-3 text-right">
                          <MoneyCell
                            value={r.totalValue}
                            className="font-medium text-text-1"
                          />
                        </td>
                        <td className="border-b border-border px-3.5 py-3">
                          <StatusPill status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-border md:hidden">
                {list.rows.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/goods-return/returns/${r.id}`}
                      className="flex flex-col gap-2 px-4 py-3 active:bg-surface-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="num text-[13px] font-semibold text-accent-text">
                          {r.displayId}
                        </span>
                        <StatusPill status={r.status} />
                      </div>
                      <div className="text-[13.5px] font-medium text-text-1">
                        {r.partyName ?? "—"}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-text-3">
                        <span className="num">{shortDate(r.dated)}</span>
                        <span aria-hidden>·</span>
                        <span>{r.brokerName ?? "No broker"}</span>
                        <span aria-hidden>·</span>
                        <span>{r.returnReason}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="num text-[12px] text-text-3">
                          {r.itemCount} {r.itemCount === 1 ? "line" : "lines"}
                        </span>
                        <MoneyCell
                          value={r.totalValue}
                          className="text-[13px] font-semibold text-text-1"
                        />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>

              {list.totalPages > 1 && (
                <div className="border-t border-border px-3.5 py-3">
                  <ListPager
                    page={list.page}
                    totalPages={list.totalPages}
                    total={list.total}
                    pageSize={list.pageSize}
                  />
                </div>
              )}
            </>
          )}
        </section>
      </Reveal>
    </div>
  );
}
