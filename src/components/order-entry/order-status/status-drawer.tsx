"use client";

// StatusDrawer — docs/SCREENS.md §4A.8
//
// **A centred modal, not a side sheet.** The board is a wide grouped table
// and the thing being opened is one design line of one order — a sheet slid
// in from the right covered the very columns the drawer is explaining, and
// with prev/next walking the whole page the eye kept having to re-find the
// row underneath it. A centred dialog over a dimmed page has no such
// relationship to the table, so it can be read on its own.
//
// It never writes. The footer sends anyone with `operations.edit` to
// Operations, where the stage checkboxes actually live.
//
// Replaces the old Sheet-based status-panel.tsx.

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconExternalLink,
  IconX,
} from "@tabler/icons-react";

import {
  formatDate,
  formatDateTime,
  formatDelay,
  formatNumber,
} from "@/lib/order-entry/orders";
import type {
  OrderStatusDetail,
  OrderStatusDetailStage,
} from "@/lib/order-entry/order-status";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { STAGE_STATE_LABEL, STAGE_STATE_TONE } from "./status-style";
import { cn } from "@/lib/utils";

const iconBtn =
  "grid size-8 shrink-0 place-items-center rounded-field border border-border bg-surface text-text-2 transition-colors hover:bg-chip hover:text-text-1 disabled:pointer-events-none disabled:opacity-40";

async function fetchDetail(lineId: string): Promise<OrderStatusDetail> {
  const res = await fetch(`/api/order-entry/order-status/${lineId}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? "Failed to load detail");
  return body.data as OrderStatusDetail;
}

export function StatusDrawer({
  lineId,
  canUpdate,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: {
  lineId: string;
  /** `operations.edit` — decides between the button and the sentence. */
  canUpdate: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const asideRef = React.useRef<HTMLElement>(null);
  const closeBtnRef = React.useRef<HTMLButtonElement>(null);

  // Move focus into the dialog on open; restore it to the trigger on close.
  React.useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    return () => prev?.focus?.();
  }, []);

  // Esc closes, ← / → walk the page's lines, Tab is trapped in the dialog.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key === "ArrowLeft" && hasPrev) return onPrev();
      if (e.key === "ArrowRight" && hasNext) return onNext();
      if (e.key === "Tab" && asideRef.current) {
        const f = Array.from(
          asideRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null);
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  // Per LINE: the agent / department / remarks and the exact planned-vs-actual
  // timestamps are not in the board's list payload.
  const q = useQuery({
    queryKey: ["order-status-detail", lineId],
    queryFn: () => fetchDetail(lineId),
  });
  const d = q.data;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close detail"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[2px] motion-safe:animate-in motion-safe:fade-in-0"
      />
      <aside
        ref={asideRef}
        role="dialog"
        aria-modal="true"
        aria-label="Line status detail"
        className="relative z-10 flex max-h-[85dvh] w-full max-w-3xl flex-col overflow-hidden rounded-card border border-border bg-surface shadow-lg motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150"
      >
        <div className="flex items-center gap-2 border-b border-border p-4">
          <button
            type="button"
            onClick={onPrev}
            disabled={!hasPrev}
            aria-label="Previous line"
            className={iconBtn}
          >
            <IconChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            aria-label="Next line"
            className={iconBtn}
          >
            <IconChevronRight className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            {d ? (
              <>
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "truncate text-[15px] font-semibold text-text-1",
                      d.line.isCancelled && "text-text-3 line-through",
                    )}
                  >
                    {d.order.party} · {d.line.fabric}
                  </div>
                  {d.line.isCancelled ? (
                    <span className="inline-flex shrink-0 rounded-pill bg-status-red-dim px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-status-red">
                      Cancelled
                    </span>
                  ) : null}
                </div>
                <div className="num truncate text-xs text-text-2">
                  {d.order.orderNo} · {d.line.design}
                </div>
              </>
            ) : (
              // Holds the header's height while the fetch is in flight, so
              // walking with ← / → does not make the dialog jump.
              <div className="h-9" />
            )}
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={iconBtn}
          >
            <IconX className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {q.isLoading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-text-3">
              <Spinner /> Loading…
            </div>
          ) : q.isError || !d ? (
            <p className="py-10 text-sm text-status-red">
              {q.error instanceof Error
                ? q.error.message
                : "Failed to load detail."}
            </p>
          ) : (
            <>
              <div className="rounded-card border border-border bg-surface-2 p-4 sm:p-5">
                <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 sm:gap-x-5">
                  <Field label="OD date" value={formatDate(d.order.odDate)} num />
                  <Field label="Order no" value={d.order.orderNo} num />
                  <Field label="Agent" value={d.order.agent ?? "—"} />
                  <Field label="Haste" value={d.order.haste ?? "—"} />

                  <Field label="Fabric" value={d.line.fabric} />
                  <Field label="Design" value={d.line.design} />
                  <Field
                    label="Qty"
                    value={`${formatNumber(Number(d.line.qtyMtr))} mtr`}
                    num
                  />
                  <Field
                    label="Sales person"
                    value={d.order.salesPerson ?? "—"}
                  />

                  <Field label="Challan no" value={d.order.challanNo ?? "—"} />
                  <Field label="Lot no" value={d.order.lotNo ?? "—"} />
                  <Field label="Department" value={d.order.department ?? "—"} />
                  <Field label="Remarks" value={d.order.remarks ?? "—"} />
                </div>
                <div className="mt-4 border-t border-border pt-4 text-sm font-medium text-text-2">
                  <span className="num text-text-1">{d.doneCount}</span> of{" "}
                  {d.stages.length} stages complete
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-3 text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
                  Stage timeline
                </div>
                <ol className="flex flex-col">
                  {d.stages.map((s, i) => (
                    <TimelineStep
                      key={s.stageKey}
                      step={s}
                      isLast={i === d.stages.length - 1}
                      current={s.stageKey === d.currentStageKey}
                    />
                  ))}
                </ol>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-border p-4">
          {canUpdate && d ? (
            <Button
              className="w-full"
              nativeButton={false}
              render={<Link href={`/order-entry/tracking/${d.order.id}`} />}
            >
              <IconExternalLink /> Update in Operations
            </Button>
          ) : (
            <p className="text-center text-xs text-text-3">
              Status updates happen in Operations (Ops / Admin).
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

function TimelineStep({
  step,
  isLast,
  current,
}: {
  step: OrderStatusDetailStage;
  isLast: boolean;
  current: boolean;
}) {
  const node =
    step.state === "done"
      ? "border-transparent bg-status-green text-primary-foreground"
      : step.state === "overdue"
        ? "border-status-red bg-status-red-dim text-status-red"
        : current
          ? "border-accent-text bg-accent text-accent-text"
          : "border-border-strong bg-surface-2 text-text-3";

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full border-2",
            node,
          )}
        >
          {step.state === "done" ? (
            <IconCheck className="size-3.5" />
          ) : (
            <span className="size-2 rounded-full bg-current" />
          )}
        </span>
        {!isLast ? (
          <span className="my-1 w-0.5 flex-1 rounded-full bg-border" />
        ) : null}
      </div>
      <div className={cn("min-w-0", isLast ? "pb-1" : "pb-5")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-text-1">{step.label}</span>
          <span
            className={cn(
              "rounded-pill px-1.5 py-0.5 text-[10px] font-semibold",
              STAGE_STATE_TONE[step.state],
            )}
          >
            {STAGE_STATE_LABEL[step.state]}
            {step.state === "overdue" && step.daysOverdue > 0
              ? ` · ${step.daysOverdue}d`
              : ""}
          </span>
        </div>
        <div className="mt-1 text-xs text-text-2">
          Planned:{" "}
          <span className="num text-text-1">{formatDate(step.plannedAt)}</span>
          {step.isDone ? (
            <>
              {" "}
              · Actual:{" "}
              <span className="num text-text-1">
                {formatDateTime(step.actualAt)}
              </span>
            </>
          ) : null}
        </div>
        {step.isDone && step.delayMinutes != null ? (
          <span
            className={cn(
              "num mt-1 inline-flex rounded-pill px-1.5 py-0.5 text-[10px] font-medium",
              step.delayMinutes > 0
                ? "bg-status-amber-dim text-status-amber"
                : "bg-status-green-dim text-status-green",
            )}
          >
            {formatDelay(step.delayMinutes)}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function Field({
  label,
  value,
  num,
}: {
  label: string;
  value: string;
  num?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium text-text-2">{label}</div>
      <div className={cn("mt-0.5 text-sm font-medium text-text-1", num && "num")}>
        {value}
      </div>
    </div>
  );
}
