import type { Metadata } from "next";
import Link from "next/link";
import { IconPackage } from "@tabler/icons-react";

import { Reveal } from "@/components/ui/reveal";
import { getReturnsList } from "@/lib/goods-return/returns-query";
import { cn } from "@/lib/utils";
import { MoneyCell } from "../money-cell";
import { OfficeBar } from "../office-bar";

export const metadata: Metadata = {
  title: "Receiving — LD Silk Mills ERP",
};

const shortDate = (d: string | Date | null) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

const TH =
  "border-b border-border px-3.5 pt-3 pb-2.5 text-[11px] font-bold tracking-[0.04em] text-text-1 uppercase";
const TD = "border-b border-border px-3.5 py-3";

/**
 * Receiving — goods arriving at Bhiwandi.
 *
 * TWO TABS with counts, exactly as the standalone app has them. The counts are
 * the point: the number beside "Pending" is the day's work, and it is the first
 * thing somebody opening this screen wants to know.
 *
 * ── DESIGNED FOR A PHONE FIRST, WHICH IS UNUSUAL IN THIS ERP ────────────
 *
 * Every other screen here is a desk screen that also survives a phone. This one
 * is the reverse: it gets used standing next to a lorry, one-handed, often in
 * poor light. So below `md` it is not a table with a button squeezed into the
 * last column — it is a stack of cards where the two things that matter (the LD
 * id and the amount) are the largest text on each, and the action is
 * full-width.
 *
 * The Mark received ACTION lands in phase 4. This reads only, deliberately: the
 * design gets judged before anything in this module can write to 341 live
 * records.
 *
 * Two queries, sequential. The pending list is fetched whole rather than paged
 * — 64 rows today, and a receiving queue that hides its tail behind pagination
 * is a queue somebody works half of.
 */
export default async function ReceivingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: "pending" | "received" = raw === "received" ? "received" : "pending";

  const pending = await getReturnsList({ status: "posted", pageSize: 250 });
  const received = await getReturnsList({ status: "received", pageSize: 60 });

  const rows = tab === "received" ? received.rows : pending.rows;

  const TABS = [
    {
      key: "pending",
      label: "Pending",
      n: pending.total,
      href: "/goods-return/receiving",
    },
    {
      key: "received",
      label: "Received",
      n: received.total,
      href: "/goods-return/receiving?tab=received",
    },
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Receiving
        </h1>
        <p className="mt-1 hidden text-[13px] text-text-3 sm:block">
          Goods coming in to the Bhiwandi office.
        </p>
        <div className="mt-2">
          <OfficeBar />
        </div>
      </div>

      <Reveal index={0}>
        <nav
          aria-label="Receiving sections"
          className="flex flex-wrap gap-1.5 rounded-field border border-border bg-surface-2 p-1.5"
        >
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Link
                key={t.key}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-[8px] px-3.5 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-surface text-text-1 shadow-sm"
                    : "text-text-3 hover:text-text-1",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "num rounded-pill px-1.5 py-0.5 text-[11px] font-semibold",
                    active
                      ? "bg-accent text-accent-text"
                      : "bg-chip text-text-2",
                  )}
                >
                  {t.n}
                </span>
              </Link>
            );
          })}
        </nav>
      </Reveal>

      <Reveal index={1}>
        <section className="rounded-card border border-border bg-surface">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-status-green-dim">
                <IconPackage className="size-5 text-status-green" />
              </span>
              <p className="text-[14px] font-semibold text-text-1">
                {tab === "pending" ? "Nothing waiting" : "Nothing received yet"}
              </p>
              <p className="max-w-sm text-[13px] text-text-3">
                {tab === "pending"
                  ? "Every return posted to Bhiwandi has been marked received."
                  : "Returns appear here once Bhiwandi confirms they have arrived."}
              </p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    {tab === "pending" ? (
                      <tr>
                        <th className={`${TH} text-left`}>LD ID</th>
                        <th className={`${TH} text-left`}>Date</th>
                        <th className={`${TH} text-left`}>Party</th>
                        <th className={`${TH} text-left`}>Broker</th>
                        <th className={`${TH} text-right`}>Lines</th>
                        <th className={`${TH} text-right`}>Total</th>
                      </tr>
                    ) : (
                      <tr>
                        <th className={`${TH} text-left`}>LD ID</th>
                        <th className={`${TH} text-left`}>Date</th>
                        <th className={`${TH} text-left`}>Party</th>
                        <th className={`${TH} text-left`}>Received on</th>
                        <th className={`${TH} text-right`}>
                          Transport (Balasaheb)
                        </th>
                        <th className={`${TH} text-right`}>Bhiwandi charges</th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="[&>tr:last-child>td]:border-b-0">
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        className="transition-colors hover:bg-surface-2"
                      >
                        <td className={TD}>
                          <Link
                            href={`/goods-return/returns/${r.id}`}
                            className="num font-semibold text-accent-text hover:underline"
                          >
                            {r.displayId}
                          </Link>
                        </td>
                        <td className={`${TD} num whitespace-nowrap text-text-2`}>
                          {shortDate(r.dated)}
                        </td>
                        <td className={`${TD} text-text-1`}>
                          {r.partyName ?? "—"}
                        </td>
                        {tab === "pending" ? (
                          <>
                            <td className={`${TD} text-text-2`}>
                              {r.brokerName ?? "—"}
                            </td>
                            <td className={`${TD} num text-right text-text-2`}>
                              {r.itemCount}
                            </td>
                            <td className={`${TD} text-right`}>
                              <MoneyCell
                                value={r.totalValue}
                                className="font-medium text-text-1"
                              />
                            </td>
                          </>
                        ) : (
                          <>
                            <td
                              className={`${TD} num whitespace-nowrap text-text-2`}
                            >
                              {shortDate(r.receivedAt)}
                            </td>
                            <td className={`${TD} text-right`}>
                              <MoneyCell
                                value={r.bhiwandiTransportValue}
                                className="text-text-1"
                              />
                            </td>
                            <td className={`${TD} text-right`}>
                              <MoneyCell
                                value={r.bhiwandiCharges}
                                className="text-text-1"
                              />
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-border md:hidden">
                {rows.map((r) => (
                  <li key={r.id} className="flex flex-col gap-2.5 px-4 py-3.5">
                    <Link
                      href={`/goods-return/returns/${r.id}`}
                      className="flex flex-col gap-1.5"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="num text-[15px] font-bold text-accent-text">
                          {r.displayId}
                        </span>
                        <MoneyCell
                          value={
                            tab === "pending" ? r.totalValue : r.bhiwandiCharges
                          }
                          className="text-[15px] font-bold text-text-1"
                        />
                      </div>
                      <div className="text-[13.5px] font-medium text-text-1">
                        {r.partyName ?? "—"}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-text-3">
                        <span className="num">{shortDate(r.dated)}</span>
                        {tab === "pending" ? (
                          <>
                            <span aria-hidden>·</span>
                            <span>{r.brokerName ?? "No broker"}</span>
                            <span aria-hidden>·</span>
                            <span className="num">
                              {r.itemCount}{" "}
                              {r.itemCount === 1 ? "line" : "lines"}
                            </span>
                          </>
                        ) : (
                          <>
                            <span aria-hidden>·</span>
                            <span className="num">
                              received {shortDate(r.receivedAt)}
                            </span>
                          </>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </Reveal>
    </div>
  );
}
