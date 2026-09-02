"use client";

// Settings → Trash. Two lists from GET /api/order-entry/trash:
//  - orders:  every line soft-deleted → restore the whole order, or purge it
//  - designs: one design soft-deleted inside an otherwise-live order
// Restore is PATCH /orders/:id/delete { line_id, deleted: false } for both
// (line_id null restores the whole order). Purge is a hard DELETE and always
// goes through the confirm dialog. Port of Order Entry's
// components/trash/trash-view.tsx.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  IconRestore,
  IconTrash,
  IconTrashOff,
} from "@tabler/icons-react";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  type TrashDesign,
  type TrashList,
  type TrashOrder,
} from "@/lib/order-entry/orders";
import { Button } from "@/components/ui/button";
import {
  ConfirmDialog,
  EmptyRow,
  ErrorBanner,
  LoadingRow,
  NoticeBanner,
  PANEL_CLS,
  Pill,
  TD_CLS,
  TH_CLS,
  apiJson,
} from "./settings-ui";
import { cn } from "@/lib/utils";

// A pending permanent-purge confirmation (whole order, or one design line).
type Purge =
  | { kind: "order"; id: string; label: string }
  | { kind: "design"; orderId: string; lineId: string; label: string };

export function TrashView() {
  const [data, setData] = useState<TrashList | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [purge, setPurge] = useState<Purge | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiJson<TrashList>("/api/order-entry/trash");
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setData(res.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function restore(orderId: string, lineId: string | null, label: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await apiJson(`/api/order-entry/orders/${orderId}/delete`, {
      method: "PATCH",
      body: { line_id: lineId, deleted: false },
    });
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    await load();
    setBusy(false);
    setNotice(`Restored ${label}.`);
  }

  async function runPurge() {
    if (!purge) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res =
      purge.kind === "order"
        ? await apiJson(`/api/order-entry/orders/${purge.id}`, { method: "DELETE" })
        : await apiJson(
            `/api/order-entry/orders/${purge.orderId}/lines/${purge.lineId}`,
            { method: "DELETE" },
          );
    if (!res.ok) {
      setBusy(false);
      setPurge(null);
      setError(res.error);
      return;
    }
    await load();
    setBusy(false);
    setNotice(`Permanently deleted ${purge.label}.`);
    setPurge(null);
  }

  const orders = data?.orders ?? [];
  const designs = data?.designs ?? [];
  const empty = orders.length === 0 && designs.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-[12.5px] leading-relaxed text-text-3">
          Deleted orders and designs are kept here. Restore them, or delete them
          permanently. Cancelled (struck-through) designs are not here — those
          stay on their order.
        </p>
        <Button variant="outline" size="lg" disabled={loading || busy} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <ErrorBanner message={error} />
      <NoticeBanner message={notice} />

      {loading && !data ? (
        <div className={PANEL_CLS}>
          <LoadingRow label="Loading trash…" />
        </div>
      ) : empty ? (
        <div className={PANEL_CLS}>
          <EmptyRow
            icon={IconTrashOff}
            title="Trash is empty"
            description="Deleted orders and designs show up here, and can be restored from here."
          />
        </div>
      ) : (
        <>
          {orders.length > 0 && (
            <Section title="Deleted orders" count={orders.length}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-[13px]">
                  <thead>
                    <tr>
                      <th className={TH_CLS}>Order no</th>
                      <th className={TH_CLS}>Party</th>
                      <th className={TH_CLS}>Date</th>
                      <th className={cn(TH_CLS, "text-right")}>Designs</th>
                      <th className={cn(TH_CLS, "text-right")}>Total qty</th>
                      <th className={cn(TH_CLS, "text-right")}>Total amount</th>
                      <th className={TH_CLS}>Deleted</th>
                      <th className={cn(TH_CLS, "text-right")}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="[&>tr:last-child>td]:border-b-0">
                    {orders.map((o: TrashOrder) => (
                      <tr key={o.id} className="hover:bg-surface-2">
                        <td className={TD_CLS}>
                          <Link
                            href={`/order-entry/orders/${o.id}`}
                            className="font-mono font-semibold text-accent-text hover:underline"
                          >
                            {o.order_no}
                          </Link>
                        </td>
                        <td className={cn(TD_CLS, "text-text-1")}>{o.party_name}</td>
                        <td className={cn(TD_CLS, "font-mono whitespace-nowrap")}>
                          {formatDate(o.order_date)}
                        </td>
                        <td className={cn(TD_CLS, "text-right font-mono")}>
                          {o.design_count}
                        </td>
                        <td className={cn(TD_CLS, "text-right font-mono")}>
                          {formatNumber(o.qty_total)}
                        </td>
                        <td className={cn(TD_CLS, "text-right font-mono text-text-1")}>
                          ₹{formatNumber(o.grand_total)}
                        </td>
                        <td className={cn(TD_CLS, "font-mono whitespace-nowrap")}>
                          {formatDateTime(String(o.deleted_at))}
                        </td>
                        <td className={cn(TD_CLS, "text-right")}>
                          <RowActions
                            busy={busy}
                            onRestore={() =>
                              void restore(o.id, null, `order ${o.order_no}`)
                            }
                            onPurge={() =>
                              setPurge({
                                kind: "order",
                                id: o.id,
                                label: `order ${o.order_no}`,
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {designs.length > 0 && (
            <Section title="Deleted designs" count={designs.length}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-[13px]">
                  <thead>
                    <tr>
                      <th className={TH_CLS}>Order no</th>
                      <th className={TH_CLS}>Party</th>
                      <th className={TH_CLS}>Fabric</th>
                      <th className={TH_CLS}>Design no</th>
                      <th className={cn(TH_CLS, "text-right")}>Qty (m)</th>
                      <th className={TH_CLS}>Deleted</th>
                      <th className={cn(TH_CLS, "text-right")}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="[&>tr:last-child>td]:border-b-0">
                    {designs.map((d: TrashDesign) => (
                      <tr key={d.line_id} className="hover:bg-surface-2">
                        <td className={TD_CLS}>
                          <Link
                            href={`/order-entry/orders/${d.order_id}`}
                            className="font-mono font-semibold text-accent-text hover:underline"
                          >
                            {d.order_no}
                          </Link>
                        </td>
                        <td className={cn(TD_CLS, "text-text-1")}>{d.party_name}</td>
                        <td className={TD_CLS}>{d.quality}</td>
                        <td className={cn(TD_CLS, "font-mono")}>{d.design_no}</td>
                        <td className={cn(TD_CLS, "text-right font-mono")}>
                          {formatNumber(d.qty_mtr)}
                        </td>
                        <td className={cn(TD_CLS, "font-mono whitespace-nowrap")}>
                          {formatDateTime(String(d.deleted_at))}
                        </td>
                        <td className={cn(TD_CLS, "text-right")}>
                          <RowActions
                            busy={busy}
                            onRestore={() =>
                              void restore(
                                d.order_id,
                                d.line_id,
                                `${d.quality} · ${d.design_no}`,
                              )
                            }
                            onPurge={() =>
                              setPurge({
                                kind: "design",
                                orderId: d.order_id,
                                lineId: d.line_id,
                                label: `${d.quality} · ${d.design_no} (${d.order_no})`,
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </>
      )}

      <ConfirmDialog
        open={purge !== null}
        onOpenChange={(open) => {
          if (!open) setPurge(null);
        }}
        busy={busy}
        busyLabel="Deleting…"
        title="Delete permanently?"
        description={
          <>
            Permanently delete{" "}
            <span className="font-semibold text-text-1">{purge?.label}</span>?
            This removes it and its stage progress for good and{" "}
            <span className="font-semibold text-text-1">cannot be undone</span>.
          </>
        }
        onConfirm={() => void runPurge()}
      />
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className={PANEL_CLS}>
      <div className="flex items-center gap-2 border-b border-border px-[18px] py-3.5">
        <h2 className="text-[14.5px] font-bold text-text-1">{title}</h2>
        <Pill>{count}</Pill>
      </div>
      {children}
    </section>
  );
}

function RowActions({
  busy,
  onRestore,
  onPurge,
}: {
  busy: boolean;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="outline" size="sm" disabled={busy} onClick={onRestore}>
        <IconRestore /> Restore
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Delete permanently"
        title="Delete permanently"
        className="text-status-red hover:bg-status-red-dim hover:text-status-red"
        disabled={busy}
        onClick={onPurge}
      >
        <IconTrash />
      </Button>
    </div>
  );
}
