"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { IconArrowRight, IconClockExclamation } from "@tabler/icons-react";

import { Pager } from "@/components/ui/pager";
import { Modal } from "@/components/ui/module-parts";
import type { PendingRow } from "@/lib/reports/dashboards/order-entry";
import { count, inr, qty } from "@/lib/reports/format";
import { cn } from "@/lib/utils";

import { Card } from "../dashboard-parts";

const HEAD =
  "sticky top-0 z-10 bg-surface px-3 py-2 text-left text-[11px] font-semibold tracking-[0.05em] text-text-3 uppercase border-b border-border whitespace-nowrap";
const CELL = "px-3 py-2.5 align-middle text-[13px] text-text-2";
const ROW =
  "border-b border-border last:border-0 transition-colors hover:bg-surface-2";

/** Green under a month, amber into the second, red past it — the same
 * boundaries the ageing-band chart on this dashboard already uses. */
function daysOpenTone(days: number): string {
  if (days >= 60) return "text-status-red";
  if (days >= 31) return "text-status-amber";
  return "text-text-1";
}

function LinesTable({ rows }: { rows: PendingRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-text-3">
        <IconClockExclamation className="size-6" />
        <span className="text-[13px]">No open lines in this period.</span>
      </div>
    );
  }
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={HEAD}>Order</th>
            <th className={HEAD}>Party</th>
            <th className={HEAD}>Fabric</th>
            <th className={HEAD}>Design</th>
            <th className={`${HEAD} text-right`}>Metres</th>
            <th className={`${HEAD} text-right`}>Value</th>
            <th className={HEAD}>Waiting on</th>
            <th className={`${HEAD} text-right`}>Days open</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${r.order_no}|${r.quality}|${r.design}|${i}`}
              className={ROW}
            >
              <td
                className={`${CELL} num font-semibold whitespace-nowrap text-text-1`}
              >
                {r.order_no}
              </td>
              <td className={`${CELL} max-w-[190px] truncate`} title={r.party}>
                {r.party}
              </td>
              <td
                className={`${CELL} max-w-[140px] truncate`}
                title={r.quality}
              >
                {r.quality}
              </td>
              <td className={`${CELL} whitespace-nowrap`}>{r.design}</td>
              <td className={`${CELL} num text-right`}>{qty(r.metres)}</td>
              <td className={`${CELL} num text-right font-medium text-text-1`}>
                {inr(r.value)}
              </td>
              <td className={CELL}>
                <span className="inline-block max-w-[150px] truncate rounded-full bg-chip px-2 py-0.5 text-[11.5px] font-medium text-text-2">
                  {r.waiting_on}
                </span>
              </td>
              <td
                className={cn(
                  `${CELL} num text-right font-semibold`,
                  daysOpenTone(r.days_open),
                )}
              >
                {count(r.days_open)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type PendingPage = {
  rows: PendingRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * The "Oldest open lines" card, plus the way to see past its own top fifteen.
 *
 * The card itself is still the cheap, already-computed top fifteen the
 * dashboard built alongside its other panels — no extra query for the common
 * case of glancing at the worst of it. "View all" is a genuinely different
 * question ("show me all 4,273"), so it is its own round trip, paged, rather
 * than shipping every open line down with the page on the chance somebody
 * clicks the arrow — the order-status board learned that lesson full-size
 * once already (see CLAUDE.md, "read the header before touching it").
 */
export function OldestOpenLines({
  rows,
  total,
  params,
}: {
  rows: PendingRow[];
  total: number;
  params: { from: string; to: string; party?: string; agent?: string };
}) {
  const [open, setOpen] = React.useState(false);
  const [page, setPage] = React.useState(1);

  const query = useQuery<PendingPage>({
    queryKey: ["production-oldest-lines", params, page],
    queryFn: async () => {
      const qs = new URLSearchParams({
        from: params.from,
        to: params.to,
        page: String(page),
      });
      if (params.party) qs.set("party", params.party);
      if (params.agent) qs.set("agent", params.agent);
      const res = await fetch(`/api/reports/production/oldest-lines?${qs}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "That list could not be loaded.");
      }
      return res.json() as Promise<PendingPage>;
    },
    enabled: open,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  return (
    <>
      <Card
        title="Oldest open lines"
        sub={
          <button
            type="button"
            onClick={() => {
              setPage(1);
              setOpen(true);
            }}
            className="inline-flex cursor-pointer items-center gap-1 text-[12px] font-medium text-primary hover:underline"
          >
            {count(rows.length)} of {count(total)}
            <IconArrowRight className="size-3.5" />
          </button>
        }
        note="The fifteen that have been open longest. Click the count above to see every open line, paged."
      >
        <LinesTable rows={rows} />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        wide
        title="All open lines, oldest first"
        subtitle={`${count(total)} open lines. Ranked exactly like the card behind this — oldest first, order number then fabric then design breaking a tie.`}
        footer={
          query.data && query.data.totalPages > 1 ? (
            <div className="flex w-full items-center justify-between">
              <span className="text-[12px] text-text-3">
                Page {query.data.page} of {query.data.totalPages}
              </span>
              <Pager
                page={query.data.page}
                totalPages={query.data.totalPages}
                onPageChange={setPage}
                disabled={query.isFetching}
              />
            </div>
          ) : undefined
        }
      >
        <div className="max-h-[55vh] overflow-y-auto">
          {query.isLoading ? (
            <p className="py-10 text-center text-[13px] text-text-3">
              Loading…
            </p>
          ) : query.isError ? (
            <p className="py-10 text-center text-[13px] text-status-red">
              {(query.error as Error).message}
            </p>
          ) : (
            <LinesTable rows={query.data?.rows ?? []} />
          )}
        </div>
      </Modal>
    </>
  );
}
