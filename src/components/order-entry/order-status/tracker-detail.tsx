"use client";

// TrackerDetail — docs/SCREENS.md §4B.5, §4B.6
//
// The contents of the floating panel. The frame (fixed positioning, the drag
// state, the keyboard) lives in order-tracker.tsx; this file is what goes
// inside it, top to bottom:
//
//   1. header / drag handle + progress bar
//   2. cancelled banner, when applicable
//   3. Facts grid          — the identifying fields, in plain ink
//   4. Progress            — the seven stages
//   5. Whole order         — the order-level rollup
//   6. Colours in <quality> — only when the group has more than one line
//
// THE STAGES COME BEFORE THE METADATA DELIBERATELY. An earlier version listed
// agent / department / haste / entered-on above them and pushed the actual
// tracking off the bottom of the panel. For the same reason, a row that would
// only ever read "—" (Challan no, Lot no on an order that has neither) is not
// rendered at all.

import * as React from "react";
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconCrosshair,
  IconGripHorizontal,
  IconX,
} from "@tabler/icons-react";

import {
  formatDate,
  formatDateTime,
  formatNumber,
} from "@/lib/order-entry/orders";
import type {
  OrderStatusGroup,
  OrderStatusRow,
  StageCell,
} from "@/lib/order-entry/order-status";
import { Money } from "@/components/ui/money";
import { cn } from "@/lib/utils";
import {
  isDispatched,
  toneOfLines,
  TONE_LABEL,
  TONE_PILL,
  type QualityGroup,
} from "./quality-groups";
import { STAGE_COLUMNS } from "./stage-cell";

type StageShown = {
  text: string;
  sub?: string;
  tone: "done" | "late" | "live" | "idle";
};

// What each stage should read as. `order_entry` and `stock_checking` are the
// two that do not simply say "done": one is "order received", the other is the
// stock gate, which can also come back "out of stock".
function stageValue(key: string, cell: StageCell | undefined): StageShown {
  if (!cell) return { text: "Not started", tone: "idle" };

  if (key === "stock_checking") {
    if (cell.state === "done") return { text: "In stock", tone: "done" };
    if (cell.stockStatus === "out_of_stock")
      return { text: "Out of stock", tone: "late" };
    return {
      text: "Pending",
      sub: cell.state === "overdue" ? `${cell.daysOverdue}d overdue` : undefined,
      tone: cell.state === "overdue" ? "late" : "live",
    };
  }
  if (cell.state === "done")
    return {
      text: key === "order_entry" ? "Order received" : "Done",
      sub: cell.date ? formatDateTime(cell.date) : undefined,
      tone: "done",
    };
  if (cell.state === "overdue")
    return { text: "Pending", sub: `${cell.daysOverdue}d overdue`, tone: "late" };
  if (cell.state === "in_progress") return { text: "In progress", tone: "live" };
  return { text: "Not started", tone: "idle" };
}

// `text-surface` on the finished dot, NOT white: our green flips between a
// deep #15803d (light) and a pale #4ade80 (dark), so a fixed light glyph
// would vanish in one theme. `--surface` is exactly the token that flips the
// other way.
const DOT: Record<StageShown["tone"], string> = {
  done: "border-status-green bg-status-green text-surface",
  late: "border-status-red bg-status-red-dim text-status-red",
  live: "border-accent-text bg-accent text-accent-text",
  idle: "border-border-strong bg-surface text-text-3",
};
const VALUE: Record<StageShown["tone"], string> = {
  done: "text-status-green",
  late: "text-status-red",
  live: "text-accent-text",
  idle: "text-text-3",
};

/** "3d 4h late" reads better than "4,560 minutes". */
export function lateness(minutes: number | null | undefined): string | null {
  if (minutes == null || minutes <= 0) return null;
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h late` : `${d}d late`;
  if (h > 0) return `${h}h late`;
  return `${minutes}m late`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="shrink-0 text-[11px] font-medium tracking-[0.04em] text-text-3 uppercase">
        {label}
      </span>
      <span className="min-w-0 text-right text-[13px] font-semibold text-text-1">
        {children}
      </span>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2 px-3 py-1.5">
      <span className="shrink-0 text-[10px] font-semibold tracking-[0.06em] text-text-3 uppercase">
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-[12.5px] font-semibold text-text-1">
        {children}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold tracking-[0.09em] text-text-3 uppercase">
      {children}
    </div>
  );
}

export function TrackerDetail({
  line,
  group,
  order,
  index,
  total,
  onPrev,
  onNext,
  onSelectLine,
  onClose,
  onDragStart,
  onGoToRow,
}: {
  line?: OrderStatusRow;
  group?: QualityGroup;
  /** The whole order the line belongs to, for its totals. */
  order?: OrderStatusGroup;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onSelectLine: (lineId: string) => void;
  onClose?: () => void;
  /** Pointer-down on the title bar starts dragging the panel. */
  onDragStart?: (e: React.PointerEvent) => void;
  /** Scroll the table to the row this panel is showing, and flash it. */
  onGoToRow?: () => void;
}) {
  if (!line) return null;

  const byKey = new Map(line.stages.map((s) => [s.stageKey, s]));
  const tone = toneOfLines([line]);
  const doneCount = line.stages.filter((s) => s.state === "done").length;
  const totalStages = line.stages.length || STAGE_COLUMNS.length;
  const pct = Math.round((doneCount / totalStages) * 100);

  // What this design is waiting on, and how the order as a whole is doing.
  const currentStage = line.currentStageKey
    ? (STAGE_COLUMNS.find((c) => c.key === line.currentStageKey)?.full ??
      line.currentStageKey)
    : null;
  const orderLines = order?.lines.filter((l) => !l.isCancelled) ?? [];
  const orderActive = orderLines.length;
  const orderDispatched = orderLines.filter(isDispatched).length;

  // Buttons sit inside the drag handle; stop them starting a drag.
  const stopDrag = (e: React.PointerEvent) => e.stopPropagation();
  const navBtn =
    "inline-flex size-7 items-center justify-center rounded-field border border-border-strong bg-surface text-text-2 transition-colors hover:bg-surface-2 hover:text-text-1 disabled:opacity-40";

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Header: who / what, navigation, and how far along. It is also the
          drag handle — the panel covers part of the table, so it has to be
          movable. Double-click snaps it back to its default corner. */}
      <div
        onPointerDown={onDragStart}
        className={cn(
          "border-b border-border px-4 pt-3.5 pb-3",
          onDragStart && "cursor-grab select-none active:cursor-grabbing",
        )}
      >
        <div className="flex items-start gap-2">
          {onDragStart ? (
            <IconGripHorizontal
              aria-hidden
              className="mt-1 size-4 shrink-0 text-text-3"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] leading-tight font-semibold text-text-1">
              {line.party}
            </h2>
            <p className="num mt-0.5 truncate text-xs text-text-2">
              Order {line.orderNo} · {line.fabric} · {line.design}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onPrev}
              disabled={total < 2}
              onPointerDown={stopDrag}
              className={navBtn}
              aria-label="Previous design"
              title="Previous (←)"
            >
              <IconChevronLeft className="size-4" />
            </button>
            <span className="num w-14 text-center text-[11px] text-text-3">
              {index + 1} / {total}
            </span>
            <button
              type="button"
              onClick={onNext}
              disabled={total < 2}
              onPointerDown={stopDrag}
              className={navBtn}
              aria-label="Next design"
              title="Next (→)"
            >
              <IconChevronRight className="size-4" />
            </button>
            {onGoToRow ? (
              <button
                type="button"
                onPointerDown={stopDrag}
                onClick={onGoToRow}
                className={cn(navBtn, "ml-1")}
                aria-label="Go to this row in the table"
                title="Go to this row in the table"
              >
                <IconCrosshair className="size-4" />
              </button>
            ) : null}
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                onPointerDown={stopDrag}
                className={cn(navBtn, "ml-1")}
                aria-label="Close details"
                title="Close (Esc)"
              >
                <IconX className="size-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2.5">
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-pill px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
              TONE_PILL[tone],
            )}
          >
            {TONE_LABEL[tone]}
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-chip">
              <div
                className={cn(
                  "h-full rounded-pill transition-all",
                  tone === "done"
                    ? "bg-status-green"
                    : tone === "none"
                      ? "bg-status-red/50"
                      : "bg-status-amber",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="num shrink-0 text-[11px] font-medium text-text-2">
              {doneCount}/{totalStages}
            </span>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {line.isCancelled ? (
          <p className="mb-3 rounded-field bg-status-red-dim px-3 py-2 text-xs font-medium text-status-red ring-1 ring-status-red/20 ring-inset">
            This design is cancelled.
          </p>
        ) : null}

        {/* Two fields to a row, in PLAIN INK — the identifying facts, read
            before anything else, and deliberately uncoloured so they do not
            compete with the status below. */}
        <div className="mb-4 grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-card border border-border bg-surface-2">
          <Fact label="OD date">
            <span className="num">{formatDate(line.odDate)}</span>
          </Fact>
          <Fact label="Order no">
            <span className="num">{line.orderNo}</span>
          </Fact>
          <Fact label="Sales person">{line.salesPerson || "—"}</Fact>
          <Fact label="Quality">{line.fabric}</Fact>
          <Fact label="Design no">
            <span className="num">{line.design}</span>
          </Fact>
          <Fact label="Mtr / yard">
            <span className="num">{formatNumber(Number(line.qtyMtr))}</span>
          </Fact>
          <Fact label="Value">
            {line.lineTotal == null ? (
              "—"
            ) : (
              <Money value={Number(line.lineTotal)} />
            )}
          </Fact>
          <Fact label="Waiting on">{currentStage ?? "All stages done"}</Fact>
          {/* Rendered ONLY when set — a row that would just say "—" is noise
              in a panel whose whole job is the seven stages below. */}
          {line.challanNo ? (
            <Fact label="Challan no">
              <span className="num">{line.challanNo}</span>
            </Fact>
          ) : null}
          {line.lotNo ? (
            <Fact label="Lot no">
              <span className="num">{line.lotNo}</span>
            </Fact>
          ) : null}
        </div>

        {/* The seven stages in order. The connector is drawn in the completed
            colour only as far as the work has actually reached, so the run of
            green reads as progress at a glance. */}
        <div className="mt-4">
          <SectionLabel>Progress</SectionLabel>
          <ol className="relative mt-2">
            {STAGE_COLUMNS.map((c, i) => {
              const cell = byKey.get(c.key);
              const v = stageValue(c.key, cell);
              // Only meaningful once a stage is FINISHED — a late finish is a
              // different fact from a stage that is merely overdue now.
              const late = v.tone === "done" ? lateness(cell?.delayMinutes) : null;
              const last = i === STAGE_COLUMNS.length - 1;
              return (
                <li key={c.key} className="relative flex gap-2.5 pb-2 last:pb-0">
                  {!last ? (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-5 left-[9.5px] h-full w-px",
                        v.tone === "done" ? "bg-status-green/40" : "bg-border",
                      )}
                    />
                  ) : null}
                  <span
                    className={cn(
                      "relative z-[1] flex size-5 shrink-0 items-center justify-center rounded-full border-2 text-[9px] font-bold",
                      DOT[v.tone],
                    )}
                  >
                    {v.tone === "done" ? (
                      <IconCheck className="size-2.5" stroke={3.5} />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 items-start justify-between gap-2 border-b border-border pb-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-medium text-text-1">
                        {c.full}
                      </span>
                      {cell?.plannedAt ? (
                        <span
                          className={cn(
                            "num block text-[11px]",
                            v.tone === "late" ? "text-status-red" : "text-text-3",
                          )}
                        >
                          Due {formatDate(cell.plannedAt)}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className={cn(
                          "block text-[12px] font-semibold",
                          VALUE[v.tone],
                        )}
                      >
                        {v.text}
                      </span>
                      {v.sub || late ? (
                        <span className="num block text-[11px] font-normal text-text-3">
                          {v.sub}
                          {v.sub && late ? " · " : null}
                          {late ? (
                            <span className="font-medium text-status-amber">
                              {late}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {order ? (
          <div className="mt-4">
            <SectionLabel>Whole order {order.orderNo}</SectionLabel>
            <div className="mt-2 rounded-card border border-border bg-surface-2 px-3 py-1">
              <div className="divide-y divide-border">
                <Row label="Qualities">
                  <span className="num">{order.fabrics.length}</span>
                </Row>
                <Row label="Designs">
                  <span className="num">{order.designCount}</span>
                  {order.cancelledCount ? (
                    <span className="num ml-1 text-[11px] font-normal text-status-red">
                      +{order.cancelledCount} cancelled
                    </span>
                  ) : null}
                </Row>
                <Row label="Total qty">
                  <span className="num">{formatNumber(order.qtyTotal)}</span>
                </Row>
                <Row label="Total value">
                  <Money value={order.grandTotal} />
                </Row>
                <Row label="Dispatched">
                  <span className="num">
                    {orderDispatched}/{orderActive}
                  </span>
                  <span className="ml-1 text-[11px] font-normal text-text-3">
                    designs
                  </span>
                </Row>
              </div>
            </div>
          </div>
        ) : null}

        {group && group.lines.length > 1 ? (
          <div className="mt-4">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <SectionLabel>Colours in {group.fabric}</SectionLabel>
              <span className="num text-[11px] font-medium text-text-2">
                {group.dispatched}/{group.lines.length} dispatched
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {group.lines.map((l) => (
                <ColourChip
                  key={l.lineId}
                  line={l}
                  active={l.lineId === line.lineId}
                  onClick={() => onSelectLine(l.lineId)}
                />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-text-3">
              ✓ dispatched · • not yet — click one to open it
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** One colour (design / matching) with its dispatch state on its face. */
export function ColourChip({
  line,
  active,
  onClick,
}: {
  line: OrderStatusRow;
  active?: boolean;
  onClick?: () => void;
}) {
  const out = isDispatched(line);
  const cancelled = line.isCancelled;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      title={
        cancelled
          ? `${line.design} — cancelled`
          : out
            ? `${line.design} — dispatched`
            : `${line.design} — not dispatched`
      }
      className={cn(
        "num inline-flex items-center gap-1 rounded-pill px-2 py-1 text-[11px] font-semibold ring-1 transition-colors ring-inset",
        cancelled
          ? "bg-chip text-text-3 line-through ring-border"
          : out
            ? "bg-status-green-dim text-status-green ring-status-green/30 hover:bg-status-green-dim/70"
            : "bg-chip text-text-2 ring-border hover:bg-chip-strong",
        active && "ring-2 ring-accent-text",
      )}
    >
      <span aria-hidden>{cancelled ? "–" : out ? "✓" : "•"}</span>
      {line.design}
    </button>
  );
}
