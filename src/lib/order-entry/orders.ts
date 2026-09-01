// Ported from Order Entry's lib/orders.ts. OperationsStatus now lives here
// directly (Order Entry defined it in a UI component file; kept as a pure
// type here since this module's status pill is a different component).

export type OperationsStatus =
  | "COMPLETED"
  | "PARTIALLY COMPLETED"
  | "PENDING"
  | "CANCELLED";

export type OrderRow = {
  id: string;
  order_no: string;
  order_date: string;
  party_name: string;
  sales_person: string | null;
  agent: string | null;
  haste: string | null;
  challan_no: string | null;
  lot_no: string | null;
  department: string | null;
  fabrics: string[];
  line_count: number;
  total_line_count: number;
  cancelled_line_count: number;
  qty_total: number;
  grand_total: number;
  operations_status: OperationsStatus;
  created_at: string;
};

export type OrdersCancelSummary = {
  fully_cancelled_orders: number;
  orders_with_any_cancelled: number;
  cancelled_designs: number;
};

export type OrdersList = {
  orders: OrderRow[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  summary?: OrdersCancelSummary;
};

export type FabricBlock = {
  fabric: string;
  rate: number | null;
  designs: { design_no: string; qty_mtr: number }[];
};

export type OrderLine = {
  id: string;
  quality: string;
  design_no: string;
  qty_mtr: string;
  rate: string | null;
  line_total: string | null;
  is_cancelled: boolean;
  operations_status: OperationsStatus;
};

export type OrderDetail = {
  order: {
    id: string;
    order_no: string;
    order_date: string;
    party_name: string;
    sales_person: string | null;
    agent: string | null;
    haste: string | null;
    transport: string | null;
    challan_no: string | null;
    lot_no: string | null;
    department: string | null;
    remarks: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  };
  fabrics: FabricBlock[];
  lines: OrderLine[];
  qty_total: number;
  grand_total: number;
  operations_status: OperationsStatus;
  is_order_cancelled: boolean;
  total_line_count: number;
  cancelled_line_count: number;
};

export type StockStatus = "in_stock" | "out_of_stock";

export type TrackingStage = {
  stage_key: string;
  label: string;
  planned_at: string | null;
  actual_at: string | null;
  is_done: boolean;
  delay_minutes: number | null;
  updated_at: string;
  stock_status: StockStatus | null;
};

export type TrackingLine = {
  id: string;
  quality: string;
  design_no: string;
  qty_mtr: string;
  rate: string | null;
  line_total: string | null;
  is_cancelled: boolean;
  operations_status: OperationsStatus;
  stages: TrackingStage[];
};

export type OrderTracking = {
  order: {
    id: string;
    order_no: string;
    order_date: string;
    party_name: string;
    sales_person: string | null;
    agent: string | null;
    haste: string | null;
    department: string | null;
    challan_no: string | null;
    lot_no: string | null;
  };
  stage_keys: string[];
  lines: TrackingLine[];
  operations_status: OperationsStatus;
};

export type TrashOrder = {
  id: string;
  order_no: string;
  party_name: string;
  order_date: string;
  design_count: number;
  qty_total: number;
  grand_total: number;
  deleted_at: string;
};

export type TrashDesign = {
  line_id: string;
  order_id: string;
  order_no: string;
  party_name: string;
  order_date: string;
  quality: string;
  design_no: string;
  qty_mtr: number;
  line_total: number | null;
  deleted_at: string;
};

export type TrashList = {
  orders: TrashOrder[];
  designs: TrashDesign[];
  summary: { deleted_orders: number; deleted_designs: number };
};

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    value,
  );
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
  }).format(d);
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatDelay(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes <= 0) return "On time";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `+${h}h${m ? ` ${m}m` : ""}` : `+${m}m`;
}
