// Ported verbatim from Order Entry's lib/order-status.ts.

export type StageState = "done" | "in_progress" | "overdue" | "not_started";
export type OverallStatus = "completed" | "in_progress" | "overdue";

export const STAGE_OPTIONS: { key: string; label: string }[] = [
  { key: "order_entry", label: "Order entry" },
  { key: "stock_checking", label: "Stock checking" },
  { key: "rolling_checking", label: "Rolling & checking" },
  { key: "challan", label: "Challan" },
  { key: "bill", label: "Bill" },
  { key: "dispatch", label: "Dispatch" },
  { key: "received_lr", label: "Received LR" },
];

export type StageCell = {
  stageKey: string;
  label: string;
  state: StageState;
  date: string | null;
  daysOverdue: number;
  plannedAt?: string | null;
  delayMinutes?: number | null;
  stockStatus?: "in_stock" | "out_of_stock" | null;
  doneOf?: number;
  totalLines?: number;
  outOf?: number;
};

export type OrderStatusRow = {
  lineId: string;
  orderId: string;
  orderNo: string;
  party: string;
  fabric: string;
  design: string;
  qtyMtr: string;
  lineTotal: string | null;
  salesPerson: string | null;
  odDate: string;
  haste: string | null;
  challanNo: string | null;
  lotNo: string | null;
  createdAt: string;
  isCancelled: boolean;
  stages: StageCell[];
  doneCount: number;
  currentStageKey: string | null;
  overall: OverallStatus;
};

export type OrderStatusGroup = {
  orderId: string;
  orderNo: string;
  party: string;
  salesPerson: string | null;
  odDate: string;
  haste: string | null;
  challanNo: string | null;
  lotNo: string | null;
  fabrics: string[];
  designCount: number;
  qtyTotal: number;
  grandTotal: number;
  stages: StageCell[];
  doneCount: number;
  currentStageKey: string | null;
  overall: OverallStatus;
  isCancelled: boolean;
  cancelledCount: number;
  lines: OrderStatusRow[];
};

export type OrderStatusList = {
  groups: OrderStatusGroup[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: {
    total: number;
    inProgress: number;
    completed: number;
    overdue: number;
    cancelled: number;
  };
};

export type OrderStatusDetailStage = {
  stageKey: string;
  label: string;
  plannedAt: string | null;
  actualAt: string | null;
  isDone: boolean;
  delayMinutes: number | null;
  state: StageState;
  daysOverdue: number;
};

export type OrderStatusDetail = {
  lineId: string;
  order: {
    id: string;
    orderNo: string;
    odDate: string;
    party: string;
    salesPerson: string | null;
    agent: string | null;
    haste: string | null;
    challanNo: string | null;
    lotNo: string | null;
    department: string | null;
    remarks: string | null;
  };
  line: {
    fabric: string;
    design: string;
    qtyMtr: string;
    isCancelled: boolean;
  };
  stages: OrderStatusDetailStage[];
  doneCount: number;
  currentStageKey: string | null;
  overall: OverallStatus;
};

type RawStage = {
  stageKey: string;
  isDone: boolean;
  plannedAt: Date | string | null;
  actualAt: Date | string | null;
  delayMinutes: number | null;
  stockStatus?: string | null;
};

const iso = (v: Date | string | null): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export function computeStages(
  rawStages: RawStage[],
  ordered: { key: string; label: string }[],
  nowMs: number,
) {
  const byKey = new Map(rawStages.map((s) => [s.stageKey, s]));

  let currentIdx = -1;
  for (let i = 0; i < ordered.length; i += 1) {
    const r = byKey.get(ordered[i].key);
    if (!r?.isDone) {
      currentIdx = i;
      break;
    }
  }

  const cells: StageCell[] = [];
  const detailStages: OrderStatusDetailStage[] = [];
  let doneCount = 0;

  ordered.forEach((s, i) => {
    const r = byKey.get(s.key);
    const isDone = !!r?.isDone;
    const planned = r?.plannedAt ? new Date(r.plannedAt) : null;
    const actual = r?.actualAt ? new Date(r.actualAt) : null;

    let state: StageState;
    let daysOverdue = 0;
    if (isDone) {
      state = "done";
      doneCount += 1;
    } else if (i === currentIdx) {
      if (planned && planned.getTime() < nowMs) {
        state = "overdue";
        daysOverdue = Math.floor((nowMs - planned.getTime()) / 86_400_000);
      } else {
        state = "in_progress";
      }
    } else {
      state = "not_started";
    }

    cells.push({
      stageKey: s.key,
      label: s.label,
      state,
      date: isDone ? iso(actual) : null,
      daysOverdue,
      stockStatus:
        r?.stockStatus === "in_stock" || r?.stockStatus === "out_of_stock"
          ? r.stockStatus
          : null,
      plannedAt: iso(planned),
      delayMinutes: r?.delayMinutes ?? null,
    });
    detailStages.push({
      stageKey: s.key,
      label: s.label,
      plannedAt: iso(planned),
      actualAt: iso(actual),
      isDone,
      delayMinutes: r?.delayMinutes ?? null,
      state,
      daysOverdue,
    });
  });

  const currentStageKey = currentIdx === -1 ? null : ordered[currentIdx].key;
  const overall: OverallStatus =
    currentIdx === -1
      ? "completed"
      : cells[currentIdx].state === "overdue"
        ? "overdue"
        : "in_progress";

  return { cells, detailStages, doneCount, currentStageKey, overall };
}

export function aggregateOrderGroups(
  rows: OrderStatusRow[],
): OrderStatusGroup[] {
  const byOrder = new Map<string, OrderStatusRow[]>();
  for (const r of rows) {
    const arr = byOrder.get(r.orderId) ?? [];
    arr.push(r);
    byOrder.set(r.orderId, arr);
  }

  const groups: OrderStatusGroup[] = [];
  for (const lines of byOrder.values()) {
    const first = lines[0];
    const activeLines = lines.filter((l) => !l.isCancelled);
    const isCancelled = activeLines.length === 0;
    const total = activeLines.length;
    const stageCount = first.stages.length;

    const stages: StageCell[] = [];
    for (let i = 0; i < stageCount; i += 1) {
      const base = first.stages[i];
      if (isCancelled) {
        stages.push({
          stageKey: base.stageKey,
          label: base.label,
          state: "not_started",
          date: null,
          daysOverdue: 0,
          stockStatus: null,
          doneOf: 0,
          totalLines: 0,
          outOf: 0,
        });
        continue;
      }
      const cells = activeLines.map((l) => l.stages[i]);
      const doneCells = cells.filter((c) => c.state === "done");
      const doneN = doneCells.length;
      const anyOverdue = cells.some((c) => c.state === "overdue");
      const anyInProgress = cells.some((c) => c.state === "in_progress");

      let state: StageState;
      let date: string | null = null;
      let daysOverdue = 0;
      if (doneN === total) {
        state = "done";
        date = doneCells.reduce<string | null>(
          (acc, c) => (c.date && (acc == null || c.date > acc) ? c.date : acc),
          null,
        );
      } else if (anyOverdue) {
        state = "overdue";
        daysOverdue = Math.max(
          ...cells.map((c) => (c.state === "overdue" ? c.daysOverdue : 0)),
        );
      } else if (doneN > 0 || anyInProgress) {
        state = "in_progress";
      } else {
        state = "not_started";
      }

      const stockStatus: "in_stock" | "out_of_stock" | null =
        base.stageKey === "stock_checking"
          ? cells.some((c) => c.stockStatus === "out_of_stock")
            ? "out_of_stock"
            : doneN === total
              ? "in_stock"
              : null
          : null;

      stages.push({
        stageKey: base.stageKey,
        label: base.label,
        state,
        date,
        daysOverdue,
        stockStatus,
        plannedAt: cells.reduce<string | null>(
          (acc, c) =>
            c.plannedAt && (acc == null || c.plannedAt < acc) ? c.plannedAt : acc,
          null,
        ),
        delayMinutes: cells.reduce<number | null>(
          (acc, c) =>
            c.delayMinutes != null && (acc == null || c.delayMinutes > acc)
              ? c.delayMinutes
              : acc,
          null,
        ),
        doneOf: doneN,
        totalLines: total,
        outOf: cells.filter((c) => c.stockStatus === "out_of_stock").length,
      });
    }

    const doneCount = stages.filter((s) => s.state === "done").length;
    const currentIdx = stages.findIndex((s) => s.state !== "done");
    const currentStageKey =
      isCancelled || currentIdx === -1 ? null : stages[currentIdx].stageKey;
    const overall: OverallStatus = activeLines.every(
      (l) => l.overall === "completed",
    )
      ? "completed"
      : activeLines.some((l) => l.overall === "overdue")
        ? "overdue"
        : "in_progress";

    const shown = isCancelled ? lines : activeLines;
    groups.push({
      orderId: first.orderId,
      orderNo: first.orderNo,
      party: first.party,
      salesPerson: first.salesPerson,
      odDate: first.odDate,
      haste: first.haste,
      challanNo: first.challanNo,
      lotNo: first.lotNo,
      fabrics: [...new Set(shown.map((l) => l.fabric))],
      designCount: shown.length,
      qtyTotal: shown.reduce((s, l) => s + Number(l.qtyMtr), 0),
      grandTotal: shown.reduce((s, l) => s + Number(l.lineTotal ?? 0), 0),
      stages,
      doneCount,
      currentStageKey,
      overall,
      isCancelled,
      cancelledCount: lines.length - activeLines.length,
      lines,
    });
  }

  return groups;
}
