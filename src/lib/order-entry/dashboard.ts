// Ported from Order Entry's lib/dashboard.ts.
import type { OperationsStatus } from "./orders";

export type DashboardData = {
  range: { from: string; to: string; department: string };
  kpis: {
    orders: number;
    value: number;
    meters: number;
    activeOrders: number;
    completedOrders: number;
    overdueStages: number;
    onTimePct: number;
    prev: { orders: number; value: number; meters: number };
  };
  pipeline: { stageKey: string; label: string; sortOrder: number; count: number }[];
  statusBreakdown: {
    completed: number;
    partially: number;
    pending: number;
    cancelled: number;
  };
  delays: { onTime: number; late: number };
  cancellation: {
    cancelledDesigns: number;
    ordersWithCancel: number;
    cancelledOrders: number;
  };
  trash: { deletedDesigns: number; deletedOrders: number };
  trend: { date: string; orders: number; value: number }[];
  topParties: { party: string; orders: number; value: number }[];
  topFabrics: { fabric: string; meters: number }[];
  recentOrders: {
    id: string;
    orderNo: string;
    party: string;
    orderDate: string;
    status: OperationsStatus;
    value: number;
  }[];
  attention: {
    orderId: string;
    orderNo: string;
    party: string;
    stageLabel: string;
    daysOverdue: number;
  }[];
};

export type DateRangePreset = "today" | "7d" | "30d" | "month" | "custom";

export type Department = "ALL" | "LD" | "LINKD";

export function dayCount(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

export function presetRange(
  preset: DateRangePreset,
  todayISO: string,
): { from: string; to: string } {
  const today = new Date(`${todayISO}T00:00:00Z`);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const minus = (n: number) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - n);
    return d;
  };
  switch (preset) {
    case "today":
      return { from: todayISO, to: todayISO };
    case "7d":
      return { from: iso(minus(6)), to: todayISO };
    case "month": {
      const first = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
      );
      return { from: iso(first), to: todayISO };
    }
    case "30d":
    default:
      return { from: iso(minus(29)), to: todayISO };
  }
}
