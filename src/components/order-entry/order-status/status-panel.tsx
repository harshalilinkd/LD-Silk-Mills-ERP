"use client";

// Right-side slide-over for one order-status line, opened via the board's
// `?detail=<lineId>` query param (see page.tsx). A Client Component because
// it needs router-driven prev/next + Esc/arrow-key navigation and a client
// fetch of the single-line detail (agent/department/remarks + exact
// planned/actual timestamps aren't in the board's list payload — see the
// [id] route). The rollup + sibling colour chips, by contrast, come straight
// off the `groups` prop the board already loaded server-side, since the
// whole order's lines never split across a page (aggregateOrderGroups groups
// by order before pagination).
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconX,
} from "@tabler/icons-react";

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  formatDate,
  formatDateTime,
  formatDelay,
  formatNumber,
} from "@/lib/order-entry/orders";
import type {
  OrderStatusDetail,
  OrderStatusDetailStage,
  OrderStatusGroup,
  OrderStatusRow,
} from "@/lib/order-entry/order-status";
import {
  DISPATCH_STAGE_KEY,
  STAGE_STATE_LABEL,
  STAGE_STATE_TONE,
} from "./status-style";
import { cn } from "@/lib/utils";

function isDispatchedLine(l: OrderStatusRow): boolean {
  return l.stages.find((s) => s.stageKey === DISPATCH_STAGE_KEY)?.state === "done";
}

export function StatusPanel({ groups }: { groups: OrderStatusGroup[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lineId = searchParams.get("detail");

  const flatLines = React.useMemo(
    () => groups.flatMap((g) => g.lines),
    [groups],
  );
  const idx = lineId ? flatLines.findIndex((l) => l.lineId === lineId) : -1;
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < flatLines.length - 1;

  const goTo = React.useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set("detail", id);
      else params.delete("detail");
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Esc closes, ← / → walk the flat line list for the current page.
  React.useEffect(() => {
    if (!lineId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        goTo(null);
      } else if (e.key === "ArrowLeft" && idx > 0) {
        goTo(flatLines[idx - 1].lineId);
      } else if (e.key === "ArrowRight" && idx >= 0 && idx < flatLines.length - 1) {
        goTo(flatLines[idx + 1].lineId);
      }
    }
    // Capture phase: the Sheet's underlying Base UI dialog handles arrow keys
    // for its own focus management and stops them propagating, so a normal
    // bubble-phase window listener never sees ← / → while the panel is open.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [lineId, idx, flatLines, goTo]);

  const [detail, setDetail] = React.useState<OrderStatusDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!lineId) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/order-entry/order-status/${lineId}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "Failed to load detail");
        return body.data as OrderStatusDetail;
      })
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load detail");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lineId]);

  const matchedGroup = detail
    ? groups.find((g) => g.orderId === detail.order.id)
    : undefined;
  const currentLine = matchedGroup?.lines.find((l) => l.lineId === lineId);
  const siblings =
    matchedGroup && currentLine
      ? matchedGroup.lines.filter((l) => l.fabric === currentLine.fabric)
      : [];
  const activeLines = matchedGroup?.lines.filter((l) => !l.isCancelled) ?? [];
  const dispatchedCount = activeLines.filter(isDispatchedLine).length;

  return (
    <Sheet
      open={!!lineId}
      onOpenChange={(open) => {
        if (!open) goTo(null);
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <SheetTitle className="sr-only">
          {detail ? `${detail.order.orderNo} status` : "Order status detail"}
        </SheetTitle>

        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => hasPrev && goTo(flatLines[idx - 1].lineId)}
            disabled={!hasPrev}
            aria-label="Previous line"
          >
            <IconChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => hasNext && goTo(flatLines[idx + 1].lineId)}
            disabled={!hasNext}
            aria-label="Next line"
          >
            <IconChevronRight className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            {detail ? (
              <>
                <div className="truncate text-[15px] font-bold text-text-1">
                  {detail.order.orderNo}{" "}
                  <span className="font-normal text-text-3">·</span>{" "}
                  {detail.order.party}
                </div>
                <div className="truncate text-[12px] text-text-3">
                  {detail.line.fabric} · {detail.line.design}
                  {detail.line.isCancelled && (
                    <span className="ml-1.5 font-semibold text-status-red">
                      Cancelled
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="h-[34px]" />
            )}
          </div>
          <SheetClose
            render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}
          >
            <IconX className="size-4" />
          </SheetClose>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && !detail ? (
            <p className="py-10 text-center text-[13px] text-text-3">Loading…</p>
          ) : error ? (
            <p className="py-10 text-center text-[13px] text-status-red">{error}</p>
          ) : detail ? (
            <>
              <div className="rounded-[10px] border border-border bg-surface-2 px-4 py-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 sm:grid-cols-4">
                  <Field label="OD date" value={formatDate(detail.order.odDate)} mono />
                  <Field label="Order no" value={detail.order.orderNo} mono />
                  <Field label="Agent" value={detail.order.agent ?? "—"} />
                  <Field label="Haste" value={detail.order.haste ?? "—"} />

                  <Field label="Fabric" value={detail.line.fabric} />
                  <Field label="Design" value={detail.line.design} />
                  <Field
                    label="Qty"
                    value={`${formatNumber(Number(detail.line.qtyMtr))} m`}
                    mono
                  />
                  <Field label="Sales person" value={detail.order.salesPerson ?? "—"} />

                  <Field label="Challan no" value={detail.order.challanNo ?? "—"} />
                  <Field label="Lot no" value={detail.order.lotNo ?? "—"} />
                  <Field label="Department" value={detail.order.department ?? "—"} />
                  <Field label="Remarks" value={detail.order.remarks ?? "—"} />
                </div>
                <div className="mt-4 border-t border-border pt-3.5 text-[12.5px] font-semibold text-text-2">
                  <span className="font-mono text-text-1">{detail.doneCount}</span> of{" "}
                  {detail.stages.length} stages complete
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-3">
                  Stage timeline
                </div>
                <ol className="flex flex-col">
                  {detail.stages.map((s, i) => (
                    <TimelineStep
                      key={s.stageKey}
                      step={s}
                      isLast={i === detail.stages.length - 1}
                      current={s.stageKey === detail.currentStageKey}
                    />
                  ))}
                </ol>
              </div>

              {matchedGroup && (
                <div className="mt-5">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-3">
                    Whole order {matchedGroup.orderNo}
                  </div>
                  <div className="rounded-[10px] border border-border bg-surface-2 px-4">
                    <RollupRow label="Qualities" value={String(matchedGroup.fabrics.length)} />
                    <RollupRow
                      label="Designs"
                      value={String(matchedGroup.designCount)}
                      note={
                        matchedGroup.cancelledCount
                          ? `+${matchedGroup.cancelledCount} cancelled`
                          : undefined
                      }
                    />
                    <RollupRow label="Total qty" value={`${formatNumber(matchedGroup.qtyTotal)} m`} />
                    <RollupRow label="Total value" value={`₹${formatNumber(matchedGroup.grandTotal)}`} />
                    <RollupRow
                      label="Dispatched"
                      value={`${dispatchedCount}/${activeLines.length}`}
                      last
                    />
                  </div>
                </div>
              )}

              {siblings.length > 1 && currentLine && (
                <div className="mt-5">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-3">
                      Colours in {currentLine.fabric}
                    </span>
                    <span className="font-mono text-[11px] text-text-3">
                      {siblings.filter(isDispatchedLine).length}/{siblings.length} dispatched
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {siblings.map((l) => (
                      <ColourChip
                        key={l.lineId}
                        line={l}
                        active={l.lineId === lineId}
                        onClick={() => goTo(l.lineId)}
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-text-3">
                    ✓ dispatched · • not yet dispatched — click one to open it
                  </p>
                </div>
              )}
            </>
          ) : null}
        </div>

        <div className="border-t border-border px-5 py-4">
          {detail ? (
            <Button
              variant="outline"
              className="w-full"
              nativeButton={false}
              render={<Link href={`/order-entry/orders/${detail.order.id}`} />}
            >
              View full order
            </Button>
          ) : null}
          <p className="mt-2 text-center text-[11px] text-text-3">
            Stage updates happen in Operations tracking (coming soon).
          </p>
        </div>
      </SheetContent>
    </Sheet>
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
  const dotTone =
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
            dotTone,
          )}
        >
          {step.state === "done" ? (
            <IconCheck className="size-3.5" />
          ) : (
            <span className="size-2 rounded-full bg-current" />
          )}
        </span>
        {!isLast && <span className="my-1 w-0.5 flex-1 rounded-full bg-border" />}
      </div>
      <div className={cn("min-w-0", isLast ? "pb-1" : "pb-5")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-text-1">{step.label}</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
              STAGE_STATE_TONE[step.state],
            )}
          >
            {STAGE_STATE_LABEL[step.state]}
            {step.state === "overdue" && step.daysOverdue > 0
              ? ` · ${step.daysOverdue}d`
              : ""}
          </span>
        </div>
        <div className="mt-1 text-[12px] text-text-3">
          Planned: <span className="font-mono text-text-2">{formatDate(step.plannedAt)}</span>
          {step.isDone ? (
            <>
              {" "}
              · Actual:{" "}
              <span className="font-mono text-text-2">{formatDateTime(step.actualAt)}</span>
            </>
          ) : null}
        </div>
        {step.isDone && step.delayMinutes != null ? (
          <span
            className={cn(
              "mt-1 inline-flex rounded-full px-2 py-0.5 font-mono text-[10.5px] font-medium",
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

function ColourChip({
  line,
  active,
  onClick,
}: {
  line: OrderStatusRow;
  active: boolean;
  onClick: () => void;
}) {
  const dispatched = isDispatchedLine(line);
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        line.isCancelled
          ? `${line.design} — cancelled`
          : dispatched
            ? `${line.design} — dispatched`
            : `${line.design} — not dispatched`
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold ring-1 ring-inset transition-colors",
        line.isCancelled
          ? "bg-chip text-text-3 line-through ring-border"
          : dispatched
            ? "bg-status-green-dim text-status-green ring-status-green/30 hover:bg-status-green-dim/70"
            : "bg-chip text-text-2 ring-border hover:bg-surface-2",
        active && "ring-2 ring-accent-text",
      )}
    >
      <span aria-hidden>{line.isCancelled ? "–" : dispatched ? "✓" : "•"}</span>
      {line.design}
    </button>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-[0.04em] text-text-3">{label}</div>
      <div className={cn("mt-0.5 text-[13px] text-text-1", mono && "font-mono")}>
        {value}
      </div>
    </div>
  );
}

function RollupRow({
  label,
  value,
  note,
  last,
}: {
  label: string;
  value: string;
  note?: string;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 py-2 text-[12.5px]",
        !last && "border-b border-border",
      )}
    >
      <span className="text-text-3">{label}</span>
      <span className="font-mono text-text-1">
        {value}
        {note && <span className="ml-1 font-sans text-[11px] text-status-red">{note}</span>}
      </span>
    </div>
  );
}
