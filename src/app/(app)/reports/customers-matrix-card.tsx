"use client";

import * as React from "react";
import { IconArrowRight, IconUsers } from "@tabler/icons-react";

import type { Matrix } from "@/lib/reports/types";
import { inr } from "@/lib/reports/format";
import { Modal } from "@/components/ui/module-parts";
import { HeatGrid } from "./dashboard-parts";

type Slice = { label: string; value: number; meta?: string };

/**
 * The customer matrix card, plus the way to see past it.
 *
 * `HeatGrid` only ever draws the matrix's own top 8 — the whole point of that
 * cap is a grid somebody can read a pattern out of, not a scroll of two
 * hundred rows. But "who ELSE ordered" is a real question the card cannot
 * answer on its own, so an arrow opens every customer in the period, ranked
 * the same way, in a plain list a phone can scroll.
 */
export function CustomersMatrixCard({
  matrix,
  allCustomers,
}: {
  matrix: Matrix;
  allCustomers: Slice[];
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <section className="flex min-w-0 flex-col rounded-card border border-border bg-surface p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[14px] font-bold text-text-1">{matrix.title}</h2>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex cursor-pointer items-center gap-1 text-[12px] font-medium text-primary hover:underline"
        >
          View all {allCustomers.length}
          <IconArrowRight className="size-3.5" />
        </button>
      </header>
      <div className="min-w-0 flex-1">
        <HeatGrid matrix={matrix} />
      </div>
      {matrix.note && (
        <p className="mt-3 text-[11.5px] leading-snug text-text-3">
          {matrix.note}
        </p>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        wide
        title="Every customer in this period"
        subtitle={`${allCustomers.length} customers, ranked by order value — the matrix above only ever draws its top 8.`}
      >
        <div className="-mx-1 max-h-[60vh] overflow-y-auto px-1">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="sticky top-0 bg-surface">
                <th className="w-10 border-b border-border px-2 py-2 text-left text-[11px] font-semibold text-text-3">
                  #
                </th>
                <th className="border-b border-border px-2 py-2 text-left text-[11px] font-semibold text-text-3">
                  Customer
                </th>
                <th className="border-b border-border px-2 py-2 text-right text-[11px] font-semibold text-text-3">
                  Orders
                </th>
                <th className="border-b border-border px-2 py-2 text-right text-[11px] font-semibold text-text-3">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {allCustomers.map((c, i) => (
                <tr key={c.label} className="hover:bg-surface-2">
                  <td className="num border-b border-border px-2 py-2 text-text-3">
                    {i + 1}
                  </td>
                  <td className="border-b border-border px-2 py-2 text-text-1">
                    {c.label}
                  </td>
                  <td className="num border-b border-border px-2 py-2 text-right text-text-2">
                    {c.meta ?? "—"}
                  </td>
                  <td className="num border-b border-border px-2 py-2 text-right font-semibold text-text-1">
                    {inr(c.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {allCustomers.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-text-3">
              <IconUsers className="size-6" />
              <span className="text-[13px]">No customers in this period.</span>
            </div>
          )}
        </div>
      </Modal>
    </section>
  );
}
