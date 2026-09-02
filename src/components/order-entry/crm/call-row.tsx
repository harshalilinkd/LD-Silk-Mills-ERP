"use client";

// One row of the CRM call log (src/app/(app)/crm/calls/page.tsx), with an
// inline expand/collapse for the full call detail — feedback text, the
// per-criterion scores, the reorder note, and the delay reason. This is the
// ONE piece of client interactivity the (otherwise fully server-rendered)
// call log needs, so it is kept to exactly this: no fetching, no writes,
// just local open/closed state. Restyled from Order Entry's
// components/crm/calls-log.tsx CallRow against this app's own design
// tokens (docs/DESIGN.md) rather than the source app's.
import * as React from "react";
import Link from "next/link";
import { IconChevronRight, IconStar, IconStarFilled } from "@tabler/icons-react";

import {
  CHANNEL_LABEL,
  DELAY_REASON_LABEL,
  type AttemptChannel,
  type CallRecord,
  type DelayReason,
  type ReorderIntent,
} from "@/lib/order-entry/crm";
import { formatCount, formatDate, formatDateTime, formatNumber } from "@/lib/order-entry/orders";
import { cn } from "@/lib/utils";
import { Pill, StatusPill } from "@/components/order-entry/crm/pill";

const INTENT_LABEL: Record<Exclude<ReorderIntent, "none">, string> = {
  maybe: "Maybe",
  yes: "Buying again",
  sample_requested: "Asked for a sample",
};

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {Array.from({ length: 5 }, (_, i) =>
        i < value ? (
          <IconStarFilled key={i} style={{ width: size, height: size }} className="text-status-amber" />
        ) : (
          <IconStar key={i} style={{ width: size, height: size }} className="text-text-3" />
        ),
      )}
    </span>
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-text-2 uppercase", className)}>
      {children}
    </div>
  );
}

export function CallRow({ row }: { row: CallRecord }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "cursor-pointer transition-colors",
          open ? "bg-accent" : "hover:bg-surface-2",
        )}
      >
        <td className="border-b border-border px-3.5 py-3">
          <div className="flex items-start gap-1.5">
            <IconChevronRight
              className={cn(
                "mt-[3px] size-3.5 shrink-0 text-text-3 transition-transform",
                open && "rotate-90",
              )}
            />
            <div className="min-w-0">
              <div className="font-mono text-[13px] font-semibold text-text-1">{row.orderNo}</div>
              <div className="max-w-[180px] truncate text-[11.5px] text-text-3">{row.partyName}</div>
            </div>
          </div>
        </td>
        <td className="border-b border-border px-3.5 py-3 text-text-2">{formatDate(row.deliveredAt)}</td>
        <td className="border-b border-border px-3.5 py-3">
          {row.contactedAt ? (
            <>
              <div className="text-text-2">{formatDateTime(row.contactedAt)}</div>
              {row.completedBy ? (
                <div className="max-w-[140px] truncate text-[11px] text-text-3">{row.completedBy}</div>
              ) : null}
            </>
          ) : (
            <span className="text-text-3">Not reached</span>
          )}
        </td>
        <td className="border-b border-border px-3.5 py-3">
          <div className="flex flex-col items-start gap-1">
            <StatusPill status={row.status} />
            {row.isEscalated ? (
              <span className="text-[10.5px] font-semibold text-status-red">Escalated</span>
            ) : null}
          </div>
        </td>
        <td className="border-b border-border px-3.5 py-3 font-mono text-text-2">
          {formatCount(row.attempts)}
        </td>
        <td className="border-b border-border px-3.5 py-3 text-text-2">
          {row.channels.length ? (
            row.channels.map((c) => CHANNEL_LABEL[c as AttemptChannel] ?? c).join(", ")
          ) : (
            <span className="text-text-3">—</span>
          )}
        </td>
        <td className="border-b border-border px-3.5 py-3">
          {row.ratingOverall === null ? (
            <span className="text-text-3">—</span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Stars value={row.ratingOverall} />
              <span className="font-mono text-[12px] font-semibold text-text-1">{row.ratingOverall}</span>
            </span>
          )}
        </td>
        <td className="border-b border-border px-3.5 py-3">
          {row.reorderIntent === "none" ? (
            <span className="text-text-3">—</span>
          ) : (
            <Pill tone={row.reorderIntent === "yes" ? "done" : "progress"} dot={false}>
              {INTENT_LABEL[row.reorderIntent]}
            </Pill>
          )}
        </td>
        <td className="border-b border-border px-3.5 py-3 text-right">
          {row.issues === 0 ? (
            <span className="text-text-3">—</span>
          ) : (
            <Link
              href={`/crm/issues?q=${encodeURIComponent(row.orderNo)}&status=ALL`}
              onClick={(e) => e.stopPropagation()}
              title={`Open ${row.issues === 1 ? "this complaint" : "these complaints"} on the issues board`}
              className={cn(
                "inline-flex min-w-[22px] items-center justify-center rounded-full px-2 py-0.5 font-mono text-[11.5px] font-semibold hover:underline",
                row.openIssues > 0 ? "bg-status-red-dim text-status-red" : "bg-surface-2 text-text-2",
              )}
            >
              {row.issues}
            </Link>
          )}
        </td>
      </tr>

      {open ? (
        <tr className="bg-surface-2">
          <td colSpan={9} className="border-b border-border px-4 py-4 whitespace-normal sm:px-5">
            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <Label>Scores</Label>
                {row.subRatings.length === 0 ? (
                  <p className="text-[12.5px] text-text-3">Not rated.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {row.subRatings.map((s) => (
                      <li key={s.key} className="flex items-center justify-between gap-3 text-[12.5px]">
                        <span className="text-text-2">{s.label}</span>
                        <span className="inline-flex items-center gap-1.5">
                          <Stars value={s.value} size={12} />
                          <span className="font-mono font-semibold text-text-1">{s.value}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {row.ratingSource ? (
                  <p className="mt-2 text-[11.5px] text-text-3">
                    {row.ratingSource === "customer"
                      ? "The customer stated these."
                      : "The coordinator judged these."}
                  </p>
                ) : null}
              </div>

              <div className="md:col-span-2">
                <Label>In their own words</Label>
                {row.feedback?.trim() ? (
                  <p className="rounded-lg border-l-[3px] border-l-primary bg-surface px-3 py-3 text-[13px] leading-relaxed text-text-1">
                    {row.feedback}
                  </p>
                ) : (
                  <p className="text-[12.5px] text-text-3">Nothing was written down for this call.</p>
                )}

                {row.reorderNote ? (
                  <>
                    <Label className="mt-3.5">What they need next</Label>
                    <p className="rounded-lg border-l-[3px] border-l-status-green bg-surface px-3 py-3 text-[13px] leading-relaxed text-text-1">
                      {row.reorderNote}
                    </p>
                  </>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-border pt-3 text-[12.5px] text-text-3">
              <span>
                Order value <b className="font-mono text-text-1">₹{formatNumber(row.orderValue)}</b>
              </span>
              <span>
                On time, they said{" "}
                <b className="text-text-1">
                  {row.customerSaysOnTime === null
                    ? "not asked"
                    : row.customerSaysOnTime
                      ? "yes"
                      : `no${
                          row.delayReason
                            ? ` · ${DELAY_REASON_LABEL[row.delayReason as DelayReason] ?? row.delayReason}`
                            : ""
                        }`}
                </b>
              </span>
              {row.salesPerson ? (
                <span>
                  Sales <b className="text-text-1">{row.salesPerson}</b>
                </span>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
