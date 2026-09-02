"use client";

// The per-order operations board — a port of Order Entry's
// components/tracking/tracking-board.tsx, restyled against this shell's design
// tokens (docs/DESIGN.md) and rebuilt without TanStack Query: data comes from
// GET /api/order-entry/orders/:id/tracking held in component state, writes go
// through PATCH /api/order-entry/tracking/stage with an optimistic update and
// a rollback on failure.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCheck,
  IconLock,
} from "@tabler/icons-react";
import { useOrderEntrySession } from "@/lib/order-entry/context";
import { hasCap } from "@/lib/order-entry/rbac";
import {
  formatDate,
  formatDateTime,
  formatDelay,
  formatNumber,
  type OperationsStatus,
  type OrderTracking,
  type StockStatus,
  type TrackingLine,
  type TrackingStage,
} from "@/lib/order-entry/orders";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  OPERATIONS_LABEL,
  OPERATIONS_TEXT_TONE,
  OPERATIONS_TONE,
} from "./status-style";
import { cn } from "@/lib/utils";

const STAGE_ENDPOINT = "/api/order-entry/tracking/stage";

// Per-stage status that drives the cell COLOUR (dates move to a hover tip).
type CellState =
  | "done_ontime"
  | "done_late"
  | "live"
  | "overdue"
  | "out_of_stock"
  | "locked"
  | "pending";

// Gating, identical to the server rules in lib/order-entry/workflow.ts:
// order entry is always editable; stock checking unlocks once order entry is
// done; the five post-stock stages unlock only once stock is In stock, and are
// then free to be completed in any order among themselves.
function stageEditable(
  stageKey: string,
  orderEntryDone: boolean,
  stockInStock: boolean,
): boolean {
  if (stageKey === "order_entry") return true;
  if (stageKey === "stock_checking") return orderEntryDone;
  return stockInStock;
}

function cellState(
  stage: TrackingStage,
  key: string,
  orderEntryDone: boolean,
  stockInStock: boolean,
): CellState {
  if (stage.is_done)
    return (stage.delay_minutes ?? 0) > 0 ? "done_late" : "done_ontime";
  if (key === "stock_checking" && stage.stock_status === "out_of_stock")
    return "out_of_stock";
  if (!stageEditable(key, orderEntryDone, stockInStock)) return "locked";
  const p = stage.planned_at ? new Date(stage.planned_at).getTime() : 0;
  return p && p < Date.now() ? "overdue" : "live";
}

// Client mirrors of computeLineStatus / computeOrderStatus — workflow.ts is
// server-only (it pulls in the DB handle), so it can't be imported here.
const PROGRESS_STAGE_KEYS = new Set<string>([
  "rolling_checking",
  "challan",
  "bill",
  "dispatch",
  "received_lr",
]);

function lineStatusOf(
  stages: { stage_key: string; is_done: boolean }[],
): OperationsStatus {
  if (stages.length === 0) return "PENDING";
  if (stages.every((s) => s.is_done)) return "COMPLETED";
  const started = stages.some(
    (s) => s.is_done && PROGRESS_STAGE_KEYS.has(s.stage_key),
  );
  return started ? "PARTIALLY COMPLETED" : "PENDING";
}

function orderStatusOf(statuses: OperationsStatus[]): OperationsStatus {
  if (statuses.length === 0) return "PENDING";
  if (statuses.every((s) => s === "COMPLETED")) return "COMPLETED";
  if (statuses.every((s) => s === "PENDING")) return "PENDING";
  return "PARTIALLY COMPLETED";
}

// Signed delay in whole minutes (positive = late), mirroring the server's
// computeDelayMinutes with actual = now — so the delay pill is right on click.
function optimisticDelay(plannedAt: string | null): number {
  if (!plannedAt) return 0;
  return Math.round((Date.now() - new Date(plannedAt).getTime()) / 60000);
}

type ToggleVars = {
  lineId: string;
  stageKey: string;
  checked: boolean;
  stockStatus?: StockStatus | null;
};

// Apply a stage toggle to the loaded tracking data so the UI reacts instantly,
// mirroring what the server will do. Reconciled by the refetch on settle.
function applyOptimisticToggle(
  data: OrderTracking,
  vars: ToggleVars,
): OrderTracking {
  const nowIso = new Date().toISOString();
  const lines = data.lines.map((line) => {
    if (line.id !== vars.lineId) return line;
    const isStock = vars.stageKey === "stock_checking";
    const becomingDone = isStock
      ? vars.stockStatus === "in_stock"
      : vars.checked;
    const stages = line.stages.map((s) =>
      s.stage_key === vars.stageKey
        ? {
            ...s,
            is_done: becomingDone,
            stock_status: isStock
              ? becomingDone
                ? ("in_stock" as StockStatus)
                : (vars.stockStatus ?? null)
              : s.stock_status,
            actual_at: becomingDone ? (s.actual_at ?? nowIso) : null,
            delay_minutes: becomingDone
              ? s.actual_at
                ? s.delay_minutes
                : optimisticDelay(s.planned_at)
              : null,
          }
        : s,
    );
    // Un-ticking never cascades: later stages stay done and the line simply
    // drops to PARTIALLY COMPLETED (warned about by the confirm dialogs).
    return { ...line, stages, operations_status: lineStatusOf(stages) };
  });
  return {
    ...data,
    lines,
    operations_status: orderStatusOf(
      lines.filter((l) => !l.is_cancelled).map((l) => l.operations_status),
    ),
  };
}

// Border + tint + text per cell state.
const CELL_TONE: Record<CellState, string> = {
  done_ontime: "border-status-green/40 bg-status-green-dim text-status-green",
  done_late: "border-status-amber/40 bg-status-amber-dim text-status-amber",
  live: "border-accent-text/40 bg-accent text-accent-text",
  overdue: "border-status-red/40 bg-status-red-dim text-status-red",
  out_of_stock: "border-status-red/40 bg-status-red-dim text-status-red",
  locked: "border-border bg-chip text-text-3",
  pending: "border-border bg-surface-2 text-text-2",
};

const STATE_LABEL: Record<CellState, string> = {
  done_ontime: "Done",
  done_late: "Done",
  live: "Live",
  overdue: "Overdue",
  out_of_stock: "Out of stock",
  locked: "Locked",
  pending: "Pending",
};

const LEGEND: { state: CellState; label: string; hint: string }[] = [
  { state: "done_ontime", label: "Done", hint: "Completed on time" },
  {
    state: "done_late",
    label: "Done late",
    hint: "Completed after the planned date",
  },
  { state: "live", label: "Live", hint: "The current stage to work on" },
  {
    state: "overdue",
    label: "Overdue",
    hint: "Current stage is past its planned date",
  },
  {
    state: "out_of_stock",
    label: "Out of stock",
    hint: "Stock checking is blocked; later stages stay locked",
  },
  {
    state: "locked",
    label: "Locked",
    hint: "Set stock checking to In stock to unlock",
  },
];

export function TrackingBoard({ orderId }: { orderId: string }) {
  const { role, caps } = useOrderEntrySession();
  const canEdit = role === "ADMIN" || hasCap(caps, "operations.edit");

  const [data, setData] = useState<OrderTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cells with an in-flight toggle (each shows its own pulse). A ref counts
  // total in-flight writes so we only reconcile after the LAST one settles.
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const inFlight = useRef(0);
  const [columnPending, setColumnPending] = useState<string | null>(null);

  // Confirm (a): un-ticking a stage that still has LATER stages done.
  const [stageWarn, setStageWarn] = useState<{
    lineId: string;
    stageKey: string;
    label: string;
    stageLabel: string;
    laterLabels: string[];
    resultStatus: OperationsStatus;
  } | null>(null);
  // Confirm (b): downgrading stock off In stock while downstream stages are done.
  const [stockWarn, setStockWarn] = useState<{
    lineId: string;
    stockStatus: StockStatus | null;
    label: string;
  } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/order-entry/orders/${orderId}/tracking`);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setLoadError(body?.error ?? "Failed to load the tracking board.");
      return;
    }
    setLoadError(null);
    setData(body.data as OrderTracking);
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  // One stage write, applied optimistically and rolled back if the PATCH fails.
  async function sendToggle(vars: ToggleVars) {
    const snapshot = data;
    if (!snapshot) return;
    const key = `${vars.lineId}:${vars.stageKey}`;
    setError(null);
    inFlight.current += 1;
    setPending((p) => new Set(p).add(key));
    setData((cur) => (cur ? applyOptimisticToggle(cur, vars) : cur));

    try {
      const res = await fetch(STAGE_ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_item_id: vars.lineId,
          stage_key: vars.stageKey,
          checked: vars.checked,
          stock_status: vars.stockStatus ?? null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        // Instantly revert; the reconcile below fetches server truth anyway.
        setData(snapshot);
        setError(body?.error ?? "Failed to update this stage.");
      }
    } catch {
      setData(snapshot);
      setError("Failed to update this stage.");
    } finally {
      inFlight.current -= 1;
      setPending((p) => {
        const next = new Set(p);
        next.delete(key);
        return next;
      });
      // Reconcile only once the LAST in-flight write settles — one refetch for
      // a burst of clicks, and no refetch landing mid-edit.
      if (inFlight.current === 0) await load();
    }
  }

  const t = data;
  const active = t?.lines.filter((l) => !l.is_cancelled) ?? [];

  // Header check-all state, measured over the lines that can actually carry
  // this stage (editable now, or already done) — not every line. Otherwise an
  // out-of-stock line keeps "all done" permanently out of reach, so the header
  // box could never show as checked and could only ever mark-done.
  function columnState(stageKey: string): { all: boolean; some: boolean } {
    let inPlay = 0;
    let inPlayDone = 0;
    let anyDone = 0;
    for (const l of active) {
      const byKey = new Map(l.stages.map((s) => [s.stage_key, s]));
      const isDone = byKey.get(stageKey)?.is_done ?? false;
      if (isDone) anyDone += 1;
      const editable = stageEditable(
        stageKey,
        byKey.get("order_entry")?.is_done ?? false,
        byKey.get("stock_checking")?.is_done ?? false,
      );
      if (editable || isDone) {
        inPlay += 1;
        if (isDone) inPlayDone += 1;
      }
    }
    const all = inPlay > 0 && inPlayDone === inPlay;
    return { all, some: anyDone > 0 && !all };
  }

  // Bulk-toggle a whole stage column. Marking done: only lines where the cell
  // is actually eligible (ineligible ones are skipped and counted). Un-marking:
  // any line currently done for the stage. Stock checking has no column control
  // — it's a per-line three-way choice.
  async function toggleColumn(stageKey: string, checked: boolean) {
    const targets: TrackingLine[] = [];
    let skipped = 0;
    for (const line of active) {
      const byKey = new Map(line.stages.map((s) => [s.stage_key, s]));
      const isDoneNow = byKey.get(stageKey)?.is_done ?? false;
      if (checked) {
        if (isDoneNow) continue;
        const editable = stageEditable(
          stageKey,
          byKey.get("order_entry")?.is_done ?? false,
          byKey.get("stock_checking")?.is_done ?? false,
        );
        if (editable) targets.push(line);
        else skipped += 1;
      } else if (isDoneNow) {
        targets.push(line);
      }
    }

    setError(null);
    if (targets.length === 0) {
      if (skipped > 0) {
        setError(
          `Skipped ${skipped} — set stock to In stock first for ${skipped === 1 ? "that design" : "those designs"}.`,
        );
      }
      return;
    }

    setColumnPending(stageKey);
    try {
      const results = await Promise.all(
        targets.map((l) =>
          fetch(STAGE_ENDPOINT, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              line_item_id: l.id,
              stage_key: stageKey,
              checked,
              stock_status: null,
            }),
          }),
        ),
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        const body = await failed[0].json().catch(() => null);
        setError(body?.error ?? `Failed to update ${failed.length} design(s).`);
      } else if (checked && skipped > 0) {
        setError(
          `Updated ${targets.length}; skipped ${skipped} (stock not In stock).`,
        );
      }
      await load();
    } catch {
      setError("Failed to update this stage for every design.");
    } finally {
      setColumnPending(null);
    }
  }

  // Un-ticking (checked=false) a stage that still has LATER stages done →
  // confirm first, naming them. Completing (checked=true) goes straight through.
  function requestToggle(line: TrackingLine, stageKey: string, checked: boolean) {
    if (!checked && t) {
      const idx = t.stage_keys.indexOf(stageKey);
      const laterDone = line.stages.filter(
        (s) => t.stage_keys.indexOf(s.stage_key) > idx && s.is_done,
      );
      if (laterDone.length > 0) {
        setStageWarn({
          lineId: line.id,
          stageKey,
          label: `${line.quality} · ${line.design_no}`,
          stageLabel:
            line.stages.find((s) => s.stage_key === stageKey)?.label ?? stageKey,
          laterLabels: laterDone.map((s) => s.label),
          // The REAL resulting status: the later stages stay done, so the line
          // is PARTIALLY COMPLETED only if a post-stock stage is done — else it
          // drops back to PENDING.
          resultStatus: lineStatusOf(
            line.stages.map((s) =>
              s.stage_key === stageKey ? { ...s, is_done: false } : s,
            ),
          ),
        });
        return;
      }
    }
    void sendToggle({ lineId: line.id, stageKey, checked });
  }

  // Dropping stock to Pending / Out of stock on a line that already has stages
  // done after stock checking → confirm first. Those stages stay done; the line
  // just becomes Partially completed.
  function requestStock(line: TrackingLine, stockStatus: StockStatus | null) {
    if (!t) return;
    const stockIdx = t.stage_keys.indexOf("stock_checking");
    const downstreamDone =
      stockStatus !== "in_stock" &&
      line.stages.some(
        (s) => t.stage_keys.indexOf(s.stage_key) > stockIdx && s.is_done,
      );
    if (downstreamDone) {
      setStockWarn({
        lineId: line.id,
        stockStatus,
        label: `${line.quality} · ${line.design_no}`,
      });
      return;
    }
    void sendToggle({
      lineId: line.id,
      stageKey: "stock_checking",
      checked: stockStatus === "in_stock",
      stockStatus,
    });
  }

  if (loading) {
    return (
      <p className="text-[13px] text-text-3">Loading the operations board…</p>
    );
  }
  if (loadError || !t) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <div className="rounded-[10px] border border-border bg-surface px-4 py-6 text-[13px] text-status-red">
          {loadError ?? "Failed to load the tracking board."}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <BackLink />
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-[22px] font-bold tracking-[-0.01em] text-text-1">
              {t.order.order_no}
            </h1>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                OPERATIONS_TONE[t.operations_status],
              )}
            >
              {OPERATIONS_LABEL[t.operations_status]}
            </span>
          </div>
          <p className="text-[13px] text-text-3">
            {t.order.party_name} · {formatDate(t.order.order_date)}
            {t.order.haste ? ` · ${t.order.haste}` : ""} · Challan{" "}
            {t.order.challan_no || "—"} · Lot {t.order.lot_no || "—"}
          </p>
        </div>
        {!canEdit && (
          <span className="rounded-full bg-chip px-2.5 py-1 text-[11.5px] font-semibold text-text-3">
            Read-only
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-[10px] border border-status-red/30 bg-status-red-dim px-3.5 py-2.5 text-[12.5px] text-status-red">
          <IconAlertTriangle className="mt-[1px] size-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="font-semibold underline-offset-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {active.length === 0 ? (
        <div className="rounded-[10px] border border-border bg-surface px-4 py-10 text-center text-[13px] text-text-3">
          This order has no active designs to track.
        </div>
      ) : (
        <div className="rounded-[10px] border border-border bg-surface">
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-b border-border px-3.5 py-2.5 text-[11px] text-text-3">
            <span className="font-semibold uppercase tracking-[0.04em]">
              Legend
            </span>
            {LEGEND.map((l) => (
              <span
                key={l.state}
                title={l.hint}
                className="inline-flex items-center gap-1.5"
              >
                <span
                  className={cn(
                    "size-3 rounded-[4px] border",
                    CELL_TONE[l.state],
                  )}
                />
                {l.label}
              </span>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 border-b border-border bg-surface px-3.5 pb-2.5 pt-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-text-3">
                    Quality
                  </th>
                  {["Design", "Qty (m)", "Status"].map((h) => (
                    <th
                      key={h}
                      className="border-b border-border px-3.5 pb-2.5 pt-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-text-3"
                    >
                      {h}
                    </th>
                  ))}
                  {t.stage_keys.map((key) => {
                    const label =
                      active[0]?.stages.find((s) => s.stage_key === key)
                        ?.label ?? key;
                    const cs = columnState(key);
                    // Stock checking has no check-all — it's a per-line
                    // dropdown (Pending / In stock / Out of stock).
                    const showCheckAll = canEdit && key !== "stock_checking";
                    return (
                      <th
                        key={key}
                        className="border-b border-border px-2.5 pb-2.5 pt-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-text-3"
                      >
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          {showCheckAll && (
                            <input
                              type="checkbox"
                              checked={cs.all}
                              disabled={columnPending !== null}
                              ref={(el) => {
                                if (el) el.indeterminate = cs.some;
                              }}
                              onChange={(e) => {
                                void toggleColumn(key, e.target.checked);
                              }}
                              title={`Mark every eligible design for ${label}`}
                              aria-label={`Toggle all — ${label}`}
                              className="size-3.5 shrink-0 accent-[var(--primary)]"
                            />
                          )}
                          {label}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {active.map((line) => (
                  <LineRow
                    key={line.id}
                    line={line}
                    stageKeys={t.stage_keys}
                    canEdit={canEdit}
                    pending={pending}
                    onToggle={(stageKey, checked) =>
                      requestToggle(line, stageKey, checked)
                    }
                    onStock={(status) => requestStock(line, status)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* (a) Un-tick a stage that still has later stages done → confirm + flag. */}
      <Dialog
        open={!!stageWarn}
        onOpenChange={(open) => {
          if (!open) setStageWarn(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Un-tick {stageWarn?.stageLabel}?</DialogTitle>
            <DialogDescription>
              <span className="font-semibold text-text-1">
                {stageWarn?.label}
              </span>{" "}
              still has{" "}
              {stageWarn && stageWarn.laterLabels.length > 1
                ? "later stages"
                : "a later stage"}{" "}
              marked done —{" "}
              <span className="font-semibold text-text-1">
                {stageWarn?.laterLabels.join(", ")}
              </span>
              . Un-ticking{" "}
              <span className="font-semibold text-text-1">
                {stageWarn?.stageLabel}
              </span>{" "}
              does not undo{" "}
              {stageWarn && stageWarn.laterLabels.length > 1 ? "them" : "it"} —
              that work stays done, and this design becomes{" "}
              <span
                className={cn(
                  "font-semibold",
                  OPERATIONS_TEXT_TONE[stageWarn?.resultStatus ?? "PENDING"],
                )}
              >
                {OPERATIONS_LABEL[stageWarn?.resultStatus ?? "PENDING"]}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              size="lg"
              variant="outline"
              onClick={() => setStageWarn(null)}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              onClick={() => {
                if (stageWarn) {
                  void sendToggle({
                    lineId: stageWarn.lineId,
                    stageKey: stageWarn.stageKey,
                    checked: false,
                  });
                }
                setStageWarn(null);
              }}
            >
              Un-tick anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* (b) Stock downgrade with completed later stages → confirm + flag. */}
      <Dialog
        open={!!stockWarn}
        onOpenChange={(open) => {
          if (!open) setStockWarn(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change stock status?</DialogTitle>
            <DialogDescription>
              <span className="font-semibold text-text-1">
                {stockWarn?.label}
              </span>{" "}
              already has stages completed after stock checking. Marking stock as{" "}
              <span className="font-semibold text-text-1">
                {stockWarn?.stockStatus === "out_of_stock"
                  ? "Out of stock"
                  : "Pending"}
              </span>{" "}
              keeps that later work done — nothing is undone — but this design
              will be flagged{" "}
              <span className="font-semibold text-status-amber">
                Partially completed
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              size="lg"
              variant="outline"
              onClick={() => setStockWarn(null)}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              onClick={() => {
                if (stockWarn) {
                  void sendToggle({
                    lineId: stockWarn.lineId,
                    stageKey: "stock_checking",
                    checked: false,
                    stockStatus: stockWarn.stockStatus,
                  });
                }
                setStockWarn(null);
              }}
            >
              Change stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/order-entry/tracking"
      className="inline-flex w-fit items-center gap-1.5 text-[12.5px] font-medium text-text-3 hover:text-text-1"
    >
      <IconArrowLeft className="size-3.5" />
      All operations
    </Link>
  );
}

function LineRow({
  line,
  stageKeys,
  canEdit,
  pending,
  onToggle,
  onStock,
}: {
  line: TrackingLine;
  stageKeys: string[];
  canEdit: boolean;
  pending: Set<string>;
  onToggle: (stageKey: string, checked: boolean) => void;
  onStock: (status: StockStatus | null) => void;
}) {
  const stageByKey = new Map(line.stages.map((s) => [s.stage_key, s]));
  const orderEntryDone = stageByKey.get("order_entry")?.is_done ?? false;
  const stockInStock = stageByKey.get("stock_checking")?.is_done ?? false;
  const doneCount = line.stages.filter((s) => s.is_done).length;

  return (
    <tr className="align-top">
      <td className="sticky left-0 z-10 border-b border-border bg-surface px-3.5 py-3 font-medium whitespace-nowrap text-text-1">
        {line.quality}
      </td>
      <td className="border-b border-border px-3.5 py-3 font-mono whitespace-nowrap text-text-2">
        {line.design_no}
      </td>
      <td className="border-b border-border px-3.5 py-3 font-mono whitespace-nowrap text-text-2">
        {formatNumber(Number(line.qty_mtr))}
      </td>
      <td className="border-b border-border px-3.5 py-3">
        <div className="flex flex-col items-start gap-1">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap",
              OPERATIONS_TONE[line.operations_status],
            )}
          >
            {OPERATIONS_LABEL[line.operations_status]}
          </span>
          <span className="font-mono text-[11px] text-text-3">
            {doneCount}/{stageKeys.length} done
          </span>
        </div>
      </td>
      {stageKeys.map((key) => {
        const stage = stageByKey.get(key);
        if (!stage)
          return <td key={key} className="border-b border-border px-2 py-2" />;
        const state = cellState(stage, key, orderEntryDone, stockInStock);
        // Editable now, or already done (so it can be un-ticked).
        const editable =
          stageEditable(key, orderEntryDone, stockInStock) || stage.is_done;
        return (
          <StageCell
            key={key}
            stage={stage}
            state={state}
            isStock={key === "stock_checking"}
            locked={!editable}
            canEdit={canEdit}
            isPending={pending.has(`${line.id}:${key}`)}
            onToggle={(checked) => onToggle(key, checked)}
            onStock={onStock}
          />
        );
      })}
    </tr>
  );
}

function StageCell({
  stage,
  state,
  isStock,
  locked,
  canEdit,
  isPending,
  onToggle,
  onStock,
}: {
  stage: TrackingStage;
  state: CellState;
  isStock: boolean;
  locked: boolean;
  canEdit: boolean;
  isPending: boolean;
  onToggle: (checked: boolean) => void;
  onStock: (status: StockStatus | null) => void;
}) {
  const done = stage.is_done;
  const disabled = !canEdit || locked;
  const value: StockStatus | null = stage.stock_status ?? (done ? "in_stock" : null);
  // Dates are hidden inside the cell and surfaced on hover, so every cell is
  // one fixed-height box of the same width and the grid stays uniform.
  const tip = `${stage.label} — ${STATE_LABEL[state]} · Plan: ${formatDate(stage.planned_at)} · Actual: ${formatDateTime(stage.actual_at)}`;
  const boxCls = cn(
    "flex h-10 w-full min-w-[150px] items-center gap-1.5 rounded-lg border px-2 transition-colors",
    CELL_TONE[state],
    disabled && !done && state !== "out_of_stock" && "opacity-70",
  );
  const pulse = isPending ? (
    <span
      aria-hidden
      className="size-1.5 shrink-0 rounded-full bg-current opacity-60 motion-safe:animate-pulse"
    />
  ) : null;
  const pill =
    done && (stage.delay_minutes ?? 0) > 0 ? (
      <span className="inline-flex shrink-0 rounded-full bg-status-amber-dim px-1.5 py-0.5 font-mono text-[10px] font-semibold text-status-amber">
        {formatDelay(stage.delay_minutes)} late
      </span>
    ) : state === "out_of_stock" ? (
      <span className="inline-flex shrink-0 rounded-full bg-status-red-dim px-1.5 py-0.5 text-[10px] font-semibold text-status-red">
        Blocked
      </span>
    ) : null;

  // Stock checking is a three-way choice, so it stays a <select>.
  if (isStock) {
    return (
      <td className="border-b border-border px-2 py-2 align-middle">
        <div title={tip} className={boxCls}>
          <select
            value={value ?? ""}
            disabled={disabled}
            onChange={(e) =>
              onStock((e.target.value || null) as StockStatus | null)
            }
            aria-label="Stock status"
            className="h-7 w-[96px] shrink-0 rounded-md border border-border-strong bg-surface px-1 text-[11px] font-medium text-text-1 outline-none focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-80"
          >
            <option value="">Pending</option>
            <option value="in_stock">In stock</option>
            <option value="out_of_stock">Out of stock</option>
          </select>
          {pill}
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {pulse}
            {locked && !done ? <IconLock className="size-3" /> : null}
          </span>
        </div>
      </td>
    );
  }

  // Every other stage: the whole cell is the toggle.
  return (
    <td className="border-b border-border px-2 py-2 align-middle">
      <button
        type="button"
        title={tip}
        disabled={disabled}
        aria-pressed={done}
        aria-label={`${stage.label} — ${STATE_LABEL[state]}`}
        onClick={() => onToggle(!done)}
        className={cn(
          boxCls,
          "text-left",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <span
          className={cn(
            "grid size-3.5 shrink-0 place-items-center rounded-[4px] border",
            done
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border-strong bg-surface",
          )}
        >
          {done ? <IconCheck className="size-2.5" /> : null}
        </span>
        <span className="shrink-0 text-[11px] font-semibold">
          {STATE_LABEL[state]}
        </span>
        {pill}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {pulse}
          {locked && !done ? <IconLock className="size-3" /> : null}
        </span>
      </button>
    </td>
  );
}
