"use client";

// TrackingBoard — docs/SCREENS.md §5.2–§5.9
//
// The per-order operations board: one row per active line × seven stage
// columns, and the only screen in this module that WRITES stage progress.
// Ported from Order Entry's components/tracking/tracking-board.tsx and
// restyled against this shell's design tokens (docs/DESIGN.md).
//
// Data is TanStack Query (`["tracking", orderId]`) and every write is
// optimistic. That pairing is not decoration: the mutation's `onMutate` calls
// `cancelQueries` before it touches the cache, so a background refetch that
// was already in flight when the operator tapped a cell cannot land afterwards
// and clobber the optimistic write. Held in plain `useState` there is no way
// to cancel that read, and the cell silently flips back.

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCheck,
  IconLock,
} from "@tabler/icons-react";
import { useOrderEntrySession } from "@/lib/order-entry/context";
import { hasCap } from "@/lib/order-entry/rbac";
import { STAGE_DOT } from "@/components/order-entry/order-status/status-style";
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
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HScroll } from "@/components/ui/hscroll";
import { Reveal } from "@/components/ui/reveal";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, THead, Th } from "@/components/ui/data-table";
// The pills themselves are <StatusBadge>. These two maps are only for the
// confirm dialogs, where the status is INLINE PROSE ("…so this line stays
// Partially completed") and the badge's shouted casing would read as shouting.
import { OPERATIONS_LABEL, OPERATIONS_TEXT_TONE } from "./status-style";
import { cn } from "@/lib/utils";

const STAGE_ENDPOINT = "/api/order-entry/tracking/stage";

// Stage dots (§5.4) come from the one exported map so a stage is the same
// colour here, on the Order status board and on the dashboard pipeline. A
// second local copy briefly existed and drifted — Order Entry read purple on
// this screen and blue on the other two, which makes the dot useless as an
// identity.

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

// ── Deliberate client mirrors of lib/order-entry/workflow.ts (§5.6) ────────
// workflow.ts is server-only (it pulls in the DB handle) and cannot be
// imported into a client component, so `lineStatusOf`, `orderStatusOf` and
// `optimisticDelay` duplicate it here. If the server's rules change, these
// three change in the same commit. This is the one place this module
// knowingly duplicates the workflow module.
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

// Apply a stage toggle to the cached tracking data so the UI reacts instantly,
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

// Border + tint + text per cell state. THE CELL TINT IS THE STATUS — plan and
// actual dates are not printed here on desktop, they live in the `title`.
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

// Legend swatches are DELIBERATELY STRONGER than the cell fills (§5.3): a
// `size-3` chip carrying the cells' own low-alpha wash is unreadable, and a
// key nobody can read is worse than no key. Roughly double the alpha, and the
// neutral states step up one token (chip → chip-strong, border →
// border-strong) for the same reason.
const LEGEND_SWATCH: Record<CellState, string> = {
  done_ontime: "border-status-green/50 bg-status-green/20",
  done_late: "border-status-amber/50 bg-status-amber/20",
  live: "border-accent-text/50 bg-accent-text/20",
  overdue: "border-status-red/50 bg-status-red/20",
  out_of_stock: "border-status-red/50 bg-status-red/20",
  locked: "border-border-strong bg-chip-strong",
  pending: "border-border bg-surface-2",
};

// Six entries — `pending` has no chip, because an untinted cell needs no key.
const LEGEND: { state: CellState; label: string; hint: string }[] = [
  { state: "done_ontime", label: "Done", hint: "Completed on time" },
  {
    state: "done_late",
    label: "Done late",
    hint: "Completed after the planned date (delay shown as +Xm)",
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

// There is no toast in this shell, so the board carries a one-line banner.
// It has THREE tones on purpose: a partial column write ("Updated 4; skipped
// 2") is not a failure and must not be dressed as one — that was the bug §5.5
// calls out.
type Notice = { tone: "error" | "info" | "success"; text: string } | null;

async function fetchTracking(orderId: string): Promise<OrderTracking> {
  const res = await fetch(`/api/order-entry/orders/${orderId}/tracking`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? "Failed to load the tracking board.");
  return body.data as OrderTracking;
}

async function patchStage(vars: ToggleVars): Promise<void> {
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
    // The server answers 409 with a sentence for any rule violation
    // (WorkflowError, cancelled line, deleted line), so this is already
    // human-readable.
    throw new Error(body?.error ?? "Failed to update this stage.");
  }
}

export function TrackingBoard({ orderId }: { orderId: string }) {
  const { role, caps } = useOrderEntrySession();
  const canEdit = role === "ADMIN" || hasCap(caps, "operations.edit");
  const queryClient = useQueryClient();

  // Cells with an in-flight toggle (each shows its own pulse). A ref counts
  // total in-flight writes so we only reconcile after the LAST one settles.
  const [pending, setPending] = React.useState<Set<string>>(() => new Set());
  const inFlight = React.useRef(0);
  const [columnPending, setColumnPending] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<Notice>(null);
  // Mobile: which line's 7-stage workflow is open (defaults to the first).
  const [mobileLineId, setMobileLineId] = React.useState<string | null>(null);

  // Confirm (a): un-checking a stage that still has LATER stages done.
  const [stageWarn, setStageWarn] = React.useState<{
    lineId: string;
    stageKey: string;
    label: string;
    stageLabel: string;
    laterLabels: string[];
    resultStatus: OperationsStatus;
  } | null>(null);
  // Confirm (b): downgrading stock off In stock while downstream stages are done.
  const [stockWarn, setStockWarn] = React.useState<{
    lineId: string;
    stockStatus: StockStatus | null;
    label: string;
  } | null>(null);

  const tracking = useQuery({
    queryKey: ["tracking", orderId],
    queryFn: () => fetchTracking(orderId),
  });

  const toggle = useMutation<
    void,
    Error,
    ToggleVars,
    { prev?: OrderTracking }
  >({
    mutationFn: patchStage,
    onMutate: async (vars) => {
      const key = `${vars.lineId}:${vars.stageKey}`;
      inFlight.current += 1;
      setPending((p) => new Set(p).add(key));
      // NOTE: the banner is cleared by the request* entry points below, not
      // here. `onMutate` resolves on a microtask, so clearing it here would
      // land AFTER carry-forward's own "In stock applied to N lines." and
      // wipe the message the same click just produced.
      // THE POINT OF USING QUERY HERE: stop any refetch already in flight
      // from landing on top of the optimistic write below.
      await queryClient.cancelQueries({ queryKey: ["tracking", orderId] });
      const prev = queryClient.getQueryData<OrderTracking>([
        "tracking",
        orderId,
      ]);
      if (prev) {
        queryClient.setQueryData<OrderTracking>(
          ["tracking", orderId],
          applyOptimisticToggle(prev, vars),
        );
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      // Instantly revert this cell; the settle below fetches server truth.
      if (ctx?.prev) queryClient.setQueryData(["tracking", orderId], ctx.prev);
      setNotice({ tone: "error", text: err.message });
    },
    onSettled: (_data, _err, vars) => {
      inFlight.current -= 1;
      setPending((p) => {
        const next = new Set(p);
        next.delete(`${vars.lineId}:${vars.stageKey}`);
        return next;
      });
      // Reconcile only once the LAST in-flight write settles — one refetch for
      // a burst of clicks, and no refetch landing mid-edit (which flickers).
      if (inFlight.current === 0) {
        void queryClient.invalidateQueries({ queryKey: ["tracking", orderId] });
        void queryClient.invalidateQueries({ queryKey: ["orders"] });
        void queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      }
    },
  });

  // ── Mobile auto-advance (§5.9) ──────────────────────────────────────────
  // When the fabric being edited finishes all its stages, jump to the next
  // incomplete one. TWO guards keep it safe: it fires only on the
  // incomplete→complete transition of the CURRENTLY OPEN line, and only when
  // `lastToggledLineId` says this user's own tap caused it — so a background
  // refetch reflecting somebody else's edit never yanks the screen away from
  // an operator reviewing a finished fabric.
  //
  // The hook sits ABOVE the early returns for the rules of hooks, which is
  // why it reads `tracking.data` defensively.
  const prevComplete = React.useRef<{ id: string | null; complete: boolean }>({
    id: null,
    complete: false,
  });
  const lastToggledLineId = React.useRef<string | null>(null);
  React.useEffect(() => {
    const lines = tracking.data?.lines.filter((l) => !l.is_cancelled) ?? [];
    if (lines.length === 0) return;
    const sel = lines.find((l) => l.id === mobileLineId) ?? lines[0];
    const complete = sel.operations_status === "COMPLETED";
    const prev = prevComplete.current;
    const justCompleted =
      prev.id === sel.id &&
      !prev.complete &&
      complete &&
      lastToggledLineId.current === sel.id;
    prevComplete.current = { id: sel.id, complete };
    if (justCompleted) {
      lastToggledLineId.current = null;
      const next = lines.find(
        (l) => l.id !== sel.id && l.operations_status !== "COMPLETED",
      );
      if (next) setMobileLineId(next.id);
    }
  }, [tracking.data, mobileLineId]);

  if (tracking.isLoading) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-text-3">
        <Spinner /> Loading the operations board…
      </div>
    );
  }
  if (tracking.isError || !tracking.data) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <div className="rounded-[10px] border border-border bg-surface px-4 py-6 text-[13px] text-status-red">
          {(tracking.error as Error)?.message ??
            "Failed to load the tracking board."}
        </div>
      </div>
    );
  }

  const t = tracking.data;
  const active = t.lines.filter((l) => !l.is_cancelled);
  // Falls back to the first line if none picked yet, or if the picked line
  // disappeared after a refetch.
  const selectedMobileLine =
    active.find((l) => l.id === mobileLineId) ?? active[0];
  const meta = {
    designs: active.length,
    lotNo: t.order.lot_no ?? "",
    challanNo: t.order.challan_no ?? "",
    haste: t.order.haste ?? "",
  };

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
  // — it's a per-line three-way choice, and "everything is in stock" is not a
  // claim a header checkbox should make on the operator's behalf.
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

    setNotice(null);
    if (targets.length === 0) {
      if (skipped > 0) {
        // Name the fix, not just the failure.
        setNotice({
          tone: "error",
          text: `Skipped ${skipped} — set stock to In stock first for ${skipped === 1 ? "that design" : "those designs"}.`,
        });
      }
      return;
    }

    setColumnPending(stageKey);
    try {
      await Promise.all(
        targets.map((l) =>
          patchStage({ lineId: l.id, stageKey, checked, stockStatus: null }),
        ),
      );
      if (checked && skipped > 0) {
        // Partial success — neutral, NOT the error banner.
        setNotice({
          tone: "info",
          text: `Updated ${targets.length}; skipped ${skipped} (stock not In stock).`,
        });
      }
    } catch (e) {
      setNotice({
        tone: "error",
        text:
          e instanceof Error
            ? e.message
            : "Failed to update this stage for every design.",
      });
    } finally {
      // Reconcile in `finally`, not on the success path: Promise.all rejects
      // on the FIRST failure while the other writes have already landed, so a
      // partially-failed column would otherwise leave the board stale.
      await queryClient.invalidateQueries({ queryKey: ["tracking", orderId] });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      setColumnPending(null);
    }
  }

  function applyToggle(lineId: string, stageKey: string, checked: boolean) {
    lastToggledLineId.current = lineId;
    toggle.mutate({ lineId, stageKey, checked });
  }

  function applyStock(lineId: string, stockStatus: StockStatus | null) {
    lastToggledLineId.current = lineId;
    toggle.mutate({
      lineId,
      stageKey: "stock_checking",
      checked: stockStatus === "in_stock",
      stockStatus,
    });
  }

  // Un-ticking (checked=false) a stage that still has LATER stages done →
  // confirm first, naming them. Completing (checked=true) goes straight through.
  function requestToggle(line: TrackingLine, stageKey: string, checked: boolean) {
    setNotice(null);
    if (!checked) {
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
          // The REAL resulting status, computed rather than guessed: the later
          // stages stay done, so the line is PARTIALLY COMPLETED only if a
          // post-stock stage is done — else it drops back to PENDING.
          resultStatus: lineStatusOf(
            line.stages.map((s) =>
              s.stage_key === stageKey ? { ...s, is_done: false } : s,
            ),
          ),
        });
        return;
      }
    }
    applyToggle(line.id, stageKey, checked);
  }

  // Dropping stock to Pending / Out of stock on a line that already has stages
  // done after stock checking → confirm first. Those stages stay done; the line
  // just becomes Partially completed.
  function requestStock(line: TrackingLine, stockStatus: StockStatus | null) {
    setNotice(null);
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
    applyStock(line.id, stockStatus);
  }

  // ── Carry-forward (§5.8) ────────────────────────────────────────────────
  // Setting the FIRST row's stock to In stock fills every other line that is
  // (a) not already in stock, (b) not explicitly out_of_stock — an explicit
  // Out is never overwritten — and (c) past order entry. This is the common
  // case (one order, all fabrics in stock) and it saves a click per line
  // without ever silently reversing a decision somebody made. Any OTHER row's
  // dropdown affects only itself.
  function carryStockInStock() {
    setNotice(null);
    const targets = active.filter((l) => {
      const stock = l.stages.find((s) => s.stage_key === "stock_checking");
      if (!stock || stock.is_done) return false; // already In stock
      if (stock.stock_status === "out_of_stock") return false; // keep explicit Out
      return (
        l.stages.find((s) => s.stage_key === "order_entry")?.is_done ?? false
      );
    });
    for (const l of targets) {
      // `toggle.mutate` directly, NOT applyStock: a carry-forward is not "the
      // line the user tapped", and stamping lastToggledLineId here would let a
      // background completion auto-advance the mobile selector.
      toggle.mutate({
        lineId: l.id,
        stageKey: "stock_checking",
        checked: true,
        stockStatus: "in_stock",
      });
    }
    if (targets.length > 1) {
      setNotice({
        tone: "success",
        text: `In stock applied to ${targets.length} lines.`,
      });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <BackLink />
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="num text-lg font-semibold tracking-[-0.02em] text-text-1">
              {t.order.order_no}
            </h1>
            <StatusBadge status={t.operations_status} />
          </div>
          <p className="text-[13px] text-text-3">
            {t.order.party_name} ·{" "}
            <span className="num">{formatDate(t.order.order_date)}</span>
            {t.order.haste ? ` · ${t.order.haste}` : ""} · Challan{" "}
            {t.order.challan_no || "—"} · Lot {t.order.lot_no || "—"}
          </p>
        </div>
        {!canEdit && (
          <span className="rounded-pill bg-chip px-2.5 py-1 text-[11.5px] font-semibold text-text-3">
            Read-only
          </span>
        )}
      </div>

      {notice && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-[10px] border px-3.5 py-2.5 text-[12.5px]",
            notice.tone === "error" &&
              "border-status-red/30 bg-status-red-dim text-status-red",
            notice.tone === "success" &&
              "border-status-green/30 bg-status-green-dim text-status-green",
            notice.tone === "info" && "border-border bg-surface-2 text-text-2",
          )}
        >
          {notice.tone === "error" ? (
            <IconAlertTriangle className="mt-[1px] size-4 shrink-0" />
          ) : (
            <IconCheck className="mt-[1px] size-4 shrink-0" />
          )}
          <span className="flex-1">{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="font-semibold underline-offset-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {active.length === 0 ? (
        <div className="rounded-[10px] border border-border bg-surface px-4 py-10 text-center text-[13px] text-text-3">
          This order has no active line items to track.
        </div>
      ) : (
        <>
          {/* ── Mobile (§5.9): summary + legend, a fabric selector, then the
              selected fabric's seven stages stacked. No horizontal scrolling
              anywhere on a phone. ─────────────────────────────────────── */}
          <div className="flex flex-col gap-3 lg:hidden">
            <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-text-2">
                <span className="num">
                  {meta.designs} design{meta.designs === 1 ? "" : "s"}
                </span>
                <span>· Lot {meta.lotNo || "—"}</span>
                <span>· Challan {meta.challanNo || "—"}</span>
                <span>· Haste {meta.haste || "—"}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-2 text-[11px] text-text-2">
                <LegendChips />
              </div>
            </div>

            {/* Fabric selector — tap to switch which line you're editing. A
                button turns green once all its stages are done, so the
                selector doubles as an at-a-glance progress overview. */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {active.map((line) => {
                const complete = line.operations_status === "COMPLETED";
                const done = line.stages.filter((s) => s.is_done).length;
                const isSel = line.id === selectedMobileLine?.id;
                return (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => setMobileLineId(line.id)}
                    aria-pressed={isSel}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-[10px] border px-2.5 py-2 text-left transition-colors",
                      complete
                        ? "border-status-green/40 bg-status-green-dim text-status-green"
                        : isSel
                          ? "border-primary bg-accent text-accent-text"
                          : "border-border bg-surface-2 text-text-1 hover:border-border-strong",
                      isSel && "ring-2 ring-ring/40 ring-inset",
                    )}
                  >
                    <span className="flex items-center gap-1 text-[13px] font-semibold">
                      {complete ? (
                        <IconCheck className="size-3.5 shrink-0" />
                      ) : null}
                      <span className="truncate">{line.quality}</span>
                    </span>
                    <span className="num text-[11px] font-medium opacity-80">
                      {line.design_no} · {done}/{t.stage_keys.length}
                    </span>
                  </button>
                );
              })}
            </div>

            {selectedMobileLine ? (
              <MobileLineCard
                key={selectedMobileLine.id}
                line={selectedMobileLine}
                stageKeys={t.stage_keys}
                canEdit={canEdit}
                pending={pending}
                onToggle={(stageKey, checked) =>
                  requestToggle(selectedMobileLine, stageKey, checked)
                }
                onStock={(stockStatus) =>
                  requestStock(selectedMobileLine, stockStatus)
                }
              />
            ) : null}
          </div>

          {/* ── Desktop (§5.4): the full seven-stage matrix ─────────────── */}
          <Reveal index={0}>
            <Card size="sm" className="hidden gap-0 py-0 lg:block">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-2.5 text-[11px] text-text-2">
                <LegendChips />
              </div>
              <HScroll bodyClassName="max-h-[72vh] overflow-auto">
                {/* `border-collapse` so the sticky column's box-shadow rule
                    sits flush against the next cell. Body cells carry no
                    vertical rules of their own — with a bordered box inside
                    every one of the seven stage columns, a second set of rules
                    reads as graph paper. */}
                <Table className="border-collapse">
                  <THead>
                    <tr>
                      {/* The sticky identity column's right rule is a SHADOW,
                          not a border: a border on a sticky cell scrolls with
                          the cell's own box and leaves a gap at the seam. */}
                      <Th className="sticky left-0 z-30 border-r-0 bg-surface px-4 shadow-[1px_0_0_var(--border)]">
                        Quality
                      </Th>
                      <Th>Design</Th>
                      <Th className="text-right">Qty</Th>
                      <Th>Status</Th>
                      {t.stage_keys.map((key) => {
                        const label =
                          active[0]?.stages.find((s) => s.stage_key === key)
                            ?.label ?? key;
                        const cs = columnState(key);
                        // Stock checking has no check-all — it's a per-line
                        // dropdown with three outcomes (§5.5).
                        const showCheckAll = canEdit && key !== "stock_checking";
                        return (
                          <Th key={key} className="px-2.5">
                            <div className="flex items-center gap-2">
                              {showCheckAll ? (
                                columnPending === key ? (
                                  // A SPINNER, not a disabled checkbox: the
                                  // column is working, it is not unavailable.
                                  <Spinner className="size-3.5 border-[1.5px]" />
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={cs.all}
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
                                )
                              ) : null}
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  className={cn(
                                    "size-2 shrink-0 rounded-full",
                                    STAGE_DOT[key] ?? "bg-text-3",
                                  )}
                                />
                                {label}
                              </span>
                            </div>
                          </Th>
                        );
                      })}
                    </tr>
                  </THead>
                  <TBody>
                    {active.map((line, i) => (
                      <LineRow
                        key={line.id}
                        line={line}
                        stageKeys={t.stage_keys}
                        canEdit={canEdit}
                        pending={pending}
                        onToggle={(stageKey, checked) =>
                          requestToggle(line, stageKey, checked)
                        }
                        // Only the FIRST row carries the stock forward (§5.8).
                        onStock={(stockStatus) =>
                          i === 0 && stockStatus === "in_stock"
                            ? carryStockInStock()
                            : requestStock(line, stockStatus)
                        }
                      />
                    ))}
                  </TBody>
                </Table>
              </HScroll>
            </Card>
          </Reveal>
        </>
      )}

      {/* (a) Un-check a stage that still has later stages done → confirm. */}
      <Dialog
        open={!!stageWarn}
        onOpenChange={(open) => {
          if (!open) setStageWarn(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Un-check {stageWarn?.stageLabel}?</DialogTitle>
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
              . Un-checking{" "}
              <span className="font-semibold text-text-1">
                {stageWarn?.stageLabel}
              </span>{" "}
              leaves{" "}
              {stageWarn && stageWarn.laterLabels.length > 1 ? "those" : "that"}{" "}
              done, so this line stays{" "}
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
                  applyToggle(stageWarn.lineId, stageWarn.stageKey, false);
                }
                setStageWarn(null);
              }}
            >
              Un-check anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* (b) Stock downgrade with completed later stages → confirm. */}
      <Dialog
        open={!!stockWarn}
        onOpenChange={(open) => {
          if (!open) setStockWarn(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
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
              keeps those stages completed, but this line will be flagged{" "}
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
                  applyStock(stockWarn.lineId, stockWarn.stockStatus);
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

// The colour key, shared by the desktop matrix and the mobile summary card.
function LegendChips() {
  return (
    <>
      <span className="font-semibold tracking-[0.04em] text-text-3 uppercase">
        Legend
      </span>
      {LEGEND.map(({ state, label, hint }) => (
        <span
          key={state}
          title={hint}
          className="inline-flex items-center gap-1.5"
        >
          <span
            className={cn("size-3 rounded-[4px] border", LEGEND_SWATCH[state])}
          />
          {label}
        </span>
      ))}
    </>
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
    <tr className="border-b border-border align-top last:border-0">
      {/* The sticky column's right rule is a SHADOW, not a border: a border
          belongs to the cell's own box and shows a seam as columns scroll
          under it. */}
      <td className="sticky left-0 z-10 bg-surface px-4 py-3 shadow-[1px_0_0_var(--border)]">
        <div className="font-medium whitespace-nowrap text-text-1">
          {line.quality}
        </div>
      </td>
      <td className="num px-3 py-3 whitespace-nowrap text-text-1">
        {line.design_no}
      </td>
      <td className="num px-3 py-3 text-right whitespace-nowrap text-text-1">
        {formatNumber(Number(line.qty_mtr))} mtr
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col items-start gap-1.5">
          <StatusBadge status={line.operations_status} />
          <span className="num text-[11px] font-medium text-text-2">
            {doneCount}/{stageKeys.length} done
          </span>
        </div>
      </td>
      {stageKeys.map((key) => {
        const stage = stageByKey.get(key);
        if (!stage) return <td key={key} className="px-2.5 py-3" />;
        const state = cellState(stage, key, orderEntryDone, stockInStock);
        // Editable NOW, or already done — a done cell is always un-tickable,
        // even if the gate has since closed. Un-ticking is never blocked.
        const editable =
          key === "order_entry"
            ? true
            : key === "stock_checking"
              ? orderEntryDone
              : stockInStock || stage.is_done;
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
  const value: StockStatus | null =
    stage.stock_status ?? (done ? "in_stock" : null);
  // Dates are hidden inside the cell and surfaced on hover, so every cell is
  // one fixed-height box of the same width and the grid stays uniform.
  const tip = `${stage.label} — ${STATE_LABEL[state]} · Plan: ${formatDate(stage.planned_at)} · Actual: ${formatDateTime(stage.actual_at)}`;
  // Fixed height + a floor width so the grid stays uniform whether or not a
  // cell carries a delay pill — the pill sits INLINE beside the label, never
  // on a second line.
  const boxCls = cn(
    "flex h-10 w-full min-w-[164px] items-center gap-1.5 rounded-[10px] border px-2 transition-colors",
    CELL_TONE[state],
    disabled && !done && state !== "out_of_stock" && "opacity-70",
  );
  const pendingDot = isPending ? <PendingDot /> : null;
  const pill =
    done && (stage.delay_minutes ?? 0) > 0 ? (
      <DelayPill minutes={stage.delay_minutes} />
    ) : state === "out_of_stock" ? (
      <BlockedPill />
    ) : null;

  // Stock checking is a three-way choice, so it stays a <select>.
  if (isStock) {
    return (
      <td className="px-2 py-1.5 align-middle">
        <div title={tip} className={boxCls}>
          <select
            value={value ?? ""}
            disabled={disabled}
            onChange={(e) =>
              onStock((e.target.value || null) as StockStatus | null)
            }
            aria-label="Stock status"
            className="h-6 w-[92px] shrink-0 rounded-md border border-border-strong bg-surface px-1 text-[11px] font-medium text-text-1 outline-none focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-80"
          >
            <option value="">Pending</option>
            <option value="in_stock">In stock</option>
            <option value="out_of_stock">Out of stock</option>
          </select>
          {pill}
          {pendingDot ? <span className="ml-auto">{pendingDot}</span> : null}
        </div>
      </td>
    );
  }

  // Every other stage: the whole cell is the toggle.
  return (
    <td className="px-2 py-1.5 align-middle">
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
        <CheckBox checked={done} />
        <span className="shrink-0 text-[11px] font-medium text-text-1">
          {STATE_LABEL[state]}
        </span>
        {pill}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {pendingDot}
          {locked && !done ? (
            <IconLock className="size-3 text-text-3" />
          ) : null}
        </span>
      </button>
    </td>
  );
}

// A checkbox-styled indicator (a styled <span>, not a real input) so the whole
// cell/button owns the click.
function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "grid size-3.5 shrink-0 place-items-center rounded-[4px] border transition-colors",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border-strong bg-surface",
      )}
    >
      {checked ? <IconCheck className="size-2.5" /> : null}
    </span>
  );
}

/** Per-cell "this cell's request is in flight" marker. */
function PendingDot() {
  return (
    <span
      aria-hidden
      className="size-1.5 shrink-0 rounded-full bg-primary/50 motion-safe:animate-pulse"
    />
  );
}

function DelayPill({ minutes }: { minutes: number | null }) {
  const late = (minutes ?? 0) > 0;
  return (
    <span
      className={cn(
        "num inline-flex w-fit shrink-0 rounded-pill px-1.5 py-0.5 text-[10px] font-medium",
        late
          ? "bg-status-amber/15 text-status-amber"
          : "bg-status-green/15 text-status-green",
      )}
    >
      {formatDelay(minutes)}
    </span>
  );
}

function BlockedPill() {
  return (
    <span className="inline-flex w-fit shrink-0 rounded-pill bg-status-red/15 px-1.5 py-0.5 text-[10px] font-medium text-status-red">
      Blocked
    </span>
  );
}

// ── Mobile equivalent of a matrix row (§5.9) ───────────────────────────────
// One card for the SELECTED line, its seven stages stacked vertically so
// nothing needs horizontal scrolling.
function MobileLineCard({
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
    <div className="rounded-card border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-text-1">{line.quality}</div>
          <div className="num text-[12px] text-text-2">
            {line.design_no} · {formatNumber(Number(line.qty_mtr))} mtr
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={line.operations_status} />
          <span className="num text-[11px] font-medium text-text-2">
            {doneCount}/{stageKeys.length} done
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {stageKeys.map((key) => {
          const stage = stageByKey.get(key);
          if (!stage) return null;
          const state = cellState(stage, key, orderEntryDone, stockInStock);
          const editable =
            key === "order_entry"
              ? true
              : key === "stock_checking"
                ? orderEntryDone
                : stockInStock || stage.is_done;
          return (
            <MobileStageRow
              key={key}
              stageKey={key}
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
      </div>
    </div>
  );
}

function MobileStageRow({
  stageKey,
  stage,
  state,
  isStock,
  locked,
  canEdit,
  isPending,
  onToggle,
  onStock,
}: {
  stageKey: string;
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
  const value: StockStatus | null =
    stage.stock_status ?? (done ? "in_stock" : null);
  const boxCls = cn(
    "flex flex-col gap-1.5 rounded-[10px] border p-2.5 text-left transition-colors",
    CELL_TONE[state],
    disabled && !done && state !== "out_of_stock" && "opacity-70",
  );
  const header = (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-text-1">
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          STAGE_DOT[stageKey] ?? "bg-text-3",
        )}
      />
      {stage.label}
    </span>
  );
  // Unlike desktop the dates are PRINTED, not hidden in a `title` — there is
  // no hover on a phone.
  const dates = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-3">
      <span className="num">Plan {formatDate(stage.planned_at)}</span>
      <span className="num">Actual {formatDateTime(stage.actual_at)}</span>
      {done && (stage.delay_minutes ?? 0) > 0 ? (
        <DelayPill minutes={stage.delay_minutes} />
      ) : null}
      {state === "out_of_stock" ? <BlockedPill /> : null}
    </div>
  );

  if (isStock) {
    return (
      <div className={boxCls}>
        <div className="flex items-center justify-between gap-2">
          {header}
          <div className="flex items-center gap-1.5">
            <select
              value={value ?? ""}
              disabled={disabled}
              onChange={(e) =>
                onStock((e.target.value || null) as StockStatus | null)
              }
              aria-label="Stock status"
              className="h-9 rounded-md border border-border-strong bg-surface px-2 text-[12px] font-medium text-text-1 outline-none focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-80"
            >
              <option value="">Pending</option>
              <option value="in_stock">In stock</option>
              <option value="out_of_stock">Out of stock</option>
            </select>
            {isPending ? <PendingDot /> : null}
          </div>
        </div>
        {dates}
      </div>
    );
  }

  // Non-stock: tap anywhere on the row to mark done / undo.
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={done}
      aria-label={`${stage.label} — ${STATE_LABEL[state]}`}
      onClick={() => onToggle(!done)}
      className={cn(boxCls, disabled ? "cursor-not-allowed" : "cursor-pointer")}
    >
      <div className="flex items-center justify-between gap-2">
        {header}
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-text-1">
          {isPending ? <PendingDot /> : null}
          {locked && !done ? (
            <IconLock className="size-3 shrink-0 text-text-3" />
          ) : null}
          <CheckBox checked={done} />
          {STATE_LABEL[state]}
        </span>
      </div>
      {dates}
    </button>
  );
}
