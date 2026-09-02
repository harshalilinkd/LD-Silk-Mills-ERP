"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/order-entry/orders";
import { Autocomplete } from "./autocomplete";
import { useDesigns, useLookup } from "./use-lookups";

type DesignRow = { design_no: string; qty_mtr: string };
type FabricBlock = { fabric: string; rate: string; designs: DesignRow[] };

type InitialData = {
  order_no: string;
  order_date: string;
  party_name: string;
  sales_person: string;
  agent: string;
  haste: string;
  transport: string;
  challan_no: string;
  lot_no: string;
  department: string;
  remarks: string;
  fabrics: { fabric: string; rate: number | null; designs: { design_no: string; qty_mtr: number }[] }[];
};

// Guard-rail so a fat-fingered bulk count can't spawn thousands of rows.
const MAX_BULK_DESIGNS = 100;

const labelCls = "mb-1 block text-[11px] uppercase tracking-[0.04em] text-text-3";
const cardCls = "rounded-[10px] border border-border bg-surface px-5 py-[18px]";
const fieldCls = "text-[13px]";
// Column template shared by the design-row header and the rows themselves, so
// the two can never drift apart.
const DESIGN_ROW_COLS =
  "grid-cols-[minmax(0,1fr)_5rem_5.5rem_2.25rem] sm:grid-cols-[minmax(0,1fr)_6rem_7rem_4.25rem]";

function emptyFabric(): FabricBlock {
  return { fabric: "", rate: "", designs: [{ design_no: "", qty_mtr: "" }] };
}

export function OrderForm({
  mode,
  orderId,
  initial,
}: {
  mode: "create" | "edit";
  orderId?: string;
  initial?: InitialData;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [orderNo, setOrderNo] = useState(initial?.order_no ?? "");
  const [orderDate, setOrderDate] = useState(
    initial?.order_date ?? new Date().toISOString().slice(0, 10),
  );
  const [partyName, setPartyName] = useState(initial?.party_name ?? "");
  const [salesPerson, setSalesPerson] = useState(initial?.sales_person ?? "");
  const [agent, setAgent] = useState(initial?.agent ?? "");
  const [haste, setHaste] = useState(initial?.haste ?? "");
  const [transport, setTransport] = useState(initial?.transport ?? "");
  const [challanNo, setChallanNo] = useState(initial?.challan_no ?? "");
  const [lotNo, setLotNo] = useState(initial?.lot_no ?? "");
  const [remarks, setRemarks] = useState(initial?.remarks ?? "");
  // Department is NOT a user-editable field — the Order Entry form it was
  // ported from never showed it. Everything this app writes is "LD"; an order
  // that already carries a department keeps it rather than being silently
  // rewritten on an unrelated edit.
  const department = initial?.department?.trim() || "LD";
  const [fabrics, setFabrics] = useState<FabricBlock[]>(
    initial?.fabrics.length
      ? initial.fabrics.map((f) => ({
          fabric: f.fabric,
          rate: f.rate == null ? "" : String(f.rate),
          designs: f.designs.map((d) => ({
            design_no: d.design_no,
            qty_mtr: String(d.qty_mtr),
          })),
        }))
      : [emptyFabric()],
  );

  // Master lists behind the header autocompletes (suggestions only — a value
  // that isn't in the list is always accepted).
  const parties = useLookup("PARTY");
  const salesPeople = useLookup("SALES_PERSON");
  const agents = useLookup("AGENT");
  const hastes = useLookup("HASTE");
  const transports = useLookup("TRANSPORT");
  const fabricNames = useLookup("FABRIC");

  const [orderNoStatus, setOrderNoStatus] = useState<
    "idle" | "checking" | "available" | "taken"
  >("idle");

  useEffect(() => {
    if (!orderNo.trim() || (mode === "edit" && orderNo === initial?.order_no)) {
      setOrderNoStatus("idle");
      return;
    }
    setOrderNoStatus("checking");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/order-entry/orders/check-no?orderNo=${encodeURIComponent(orderNo.trim())}`,
        );
        const body = await res.json();
        setOrderNoStatus(body.data?.available ? "available" : "taken");
      } catch {
        setOrderNoStatus("idle");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [orderNo, mode, initial?.order_no]);

  // After adding design rows we focus the first new row's Design-no input so
  // the user can keep typing without reaching for the mouse. The input is
  // located by its block-scoped aria-label once the new row has rendered.
  const [pendingFocus, setPendingFocus] = useState<{ fi: number; di: number } | null>(
    null,
  );
  useEffect(() => {
    if (!pendingFocus) return;
    const { fi, di } = pendingFocus;
    const el = document.querySelector<HTMLInputElement>(
      `[data-fabric-block="${fi}"] input[aria-label="Design no, row ${di + 1}"]`,
    );
    el?.focus();
    setPendingFocus(null);
  }, [pendingFocus, fabrics]);

  function updateFabric(i: number, patch: Partial<FabricBlock>) {
    setFabrics((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function updateDesign(fi: number, di: number, patch: Partial<DesignRow>) {
    setFabrics((fs) =>
      fs.map((f, idx) =>
        idx !== fi
          ? f
          : {
              ...f,
              designs: f.designs.map((d, ddi) =>
                ddi === di ? { ...d, ...patch } : d,
              ),
            },
      ),
    );
  }

  // New design rows inherit the block's qty (the first row's value) so the
  // common case — every design in a block shares one qty — needs no re-typing.
  const inheritedQty = (f: FabricBlock) => f.designs[0]?.qty_mtr ?? "";

  function addDesign(fi: number) {
    const at = fabrics[fi]?.designs.length ?? 0;
    setFabrics((fs) =>
      fs.map((f, idx) =>
        idx === fi
          ? { ...f, designs: [...f.designs, { design_no: "", qty_mtr: inheritedQty(f) }] }
          : f,
      ),
    );
    setPendingFocus({ fi, di: at });
  }

  // Insert a blank design directly below row `di` and focus it — used by the
  // per-row + button and by pressing Enter inside a design row.
  function insertDesignAfter(fi: number, di: number) {
    setFabrics((fs) =>
      fs.map((f, idx) => {
        if (idx !== fi) return f;
        const designs = [...f.designs];
        designs.splice(di + 1, 0, { design_no: "", qty_mtr: inheritedQty(f) });
        return { ...f, designs };
      }),
    );
    setPendingFocus({ fi, di: di + 1 });
  }

  // Append `count` blank design rows at once (the "add 5 rows" shortcut).
  function addManyDesigns(fi: number, count: number) {
    const n = Math.min(Math.max(Math.floor(count), 1), MAX_BULK_DESIGNS);
    const start = fabrics[fi]?.designs.length ?? 0;
    setFabrics((fs) =>
      fs.map((f, idx) =>
        idx === fi
          ? {
              ...f,
              designs: [
                ...f.designs,
                ...Array.from({ length: n }, () => ({
                  design_no: "",
                  qty_mtr: inheritedQty(f),
                })),
              ],
            }
          : f,
      ),
    );
    setPendingFocus({ fi, di: start });
  }

  // Editing the FIRST design's qty carries forward to the block's other rows,
  // but only those still holding the previous common value (or still empty) —
  // a manually overridden per-row qty is preserved.
  function setFirstDesignQty(fi: number, value: string) {
    setFabrics((fs) =>
      fs.map((f, idx) => {
        if (idx !== fi) return f;
        const prev = f.designs[0]?.qty_mtr ?? "";
        return {
          ...f,
          designs: f.designs.map((d, ddi) =>
            ddi === 0
              ? { ...d, qty_mtr: value }
              : d.qty_mtr === "" || d.qty_mtr === prev
                ? { ...d, qty_mtr: value }
                : d,
          ),
        };
      }),
    );
  }

  function removeDesign(fi: number, di: number) {
    setFabrics((fs) =>
      fs.map((f, idx) =>
        idx === fi
          ? {
              ...f,
              designs:
                f.designs.length === 1
                  ? f.designs
                  : f.designs.filter((_, ddi) => ddi !== di),
            }
          : f,
      ),
    );
  }

  // A fabric already chosen in one block is dropped from the OTHER blocks'
  // suggestions so the same fabric isn't picked twice (free text still allowed).
  function fabricOptionsFor(fi: number) {
    const takenElsewhere = new Set(
      fabrics
        .filter((_, idx) => idx !== fi)
        .map((f) => f.fabric.trim().toLowerCase())
        .filter(Boolean),
    );
    return fabricNames.filter((f) => !takenElsewhere.has(f.toLowerCase()));
  }

  // ---- Live totals ----
  const blockTotals = fabrics.map((f) => {
    const rate = Number(f.rate) || 0;
    const rows = f.designs.map((d) => {
      const qty = Number(d.qty_mtr) || 0;
      return { qty, lineTotal: qty * rate };
    });
    return {
      qty: rows.reduce((s, r) => s + r.qty, 0),
      total: rows.reduce((s, r) => s + r.lineTotal, 0),
      rows,
    };
  });
  const grandQty = blockTotals.reduce((s, b) => s + b.qty, 0);
  const grandTotal = blockTotals.reduce((s, b) => s + b.total, 0);
  const designCount = fabrics.reduce((s, f) => s + f.designs.length, 0);

  function submit() {
    setError(null);
    const payload = {
      order: {
        order_no: orderNo.trim(),
        order_date: orderDate,
        party_name: partyName.trim(),
        sales_person: salesPerson.trim() || null,
        agent: agent.trim() || null,
        haste: haste.trim() || null,
        transport: transport.trim() || null,
        challan_no: challanNo.trim() || null,
        lot_no: lotNo.trim() || null,
        department,
        remarks: remarks.trim() || null,
      },
      fabrics: fabrics.map((f) => ({
        fabric: f.fabric.trim(),
        rate: f.rate.trim() === "" ? null : Number(f.rate),
        designs: f.designs
          .filter((d) => d.design_no.trim())
          .map((d) => ({ design_no: d.design_no.trim(), qty_mtr: Number(d.qty_mtr) })),
      })),
    };

    startTransition(async () => {
      const url =
        mode === "create"
          ? "/api/order-entry/orders"
          : `/api/order-entry/orders/${orderId}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Failed to save order");
        return;
      }
      const id = mode === "create" ? body.data.id : orderId;
      router.push(`/order-entry/orders/${id}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className={cardCls}>
        <h2 className="mb-4 text-[14.5px] font-bold text-text-1">Order details</h2>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls}>Order no *</label>
            <Input
              value={orderNo}
              onChange={(e) => setOrderNo(e.target.value)}
              className={fieldCls}
            />
            {orderNoStatus === "taken" && (
              <p className="mt-1 text-[11.5px] text-status-red">Already exists</p>
            )}
            {orderNoStatus === "available" && (
              <p className="mt-1 text-[11.5px] text-status-green">Available</p>
            )}
          </div>
          <div>
            <label className={labelCls}>Order date *</label>
            <Input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Party *</label>
            <Autocomplete
              value={partyName}
              onValueChange={setPartyName}
              suggestions={parties}
              aria-label="Party"
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Sales person</label>
            <Autocomplete
              value={salesPerson}
              onValueChange={setSalesPerson}
              suggestions={salesPeople}
              aria-label="Sales person"
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Agent</label>
            <Autocomplete
              value={agent}
              onValueChange={setAgent}
              suggestions={agents}
              aria-label="Agent"
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Haste</label>
            <Autocomplete
              value={haste}
              onValueChange={setHaste}
              suggestions={hastes}
              aria-label="Haste"
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Transport</label>
            <Autocomplete
              value={transport}
              onValueChange={setTransport}
              suggestions={transports}
              aria-label="Transport"
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Challan no</label>
            <Input
              value={challanNo}
              onChange={(e) => setChallanNo(e.target.value)}
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Lot no</label>
            <Input value={lotNo} onChange={(e) => setLotNo(e.target.value)} className={fieldCls} />
          </div>
        </div>
        <div className="mt-3.5">
          <label className={labelCls}>Remarks</label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-1 outline-none focus-visible:border-ring"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3.5">
        {fabrics.map((f, fi) => (
          <div key={fi} data-fabric-block={fi} className={cardCls}>
            <div className="mb-3.5 flex items-center justify-between">
              <h3 className="text-[13.5px] font-semibold text-text-1">
                Fabric block {fi + 1}
              </h3>
              {fabrics.length > 1 && (
                <button
                  type="button"
                  onClick={() => setFabrics((fs) => fs.filter((_, idx) => idx !== fi))}
                  aria-label={`Remove fabric block ${fi + 1}`}
                  className="text-text-3 hover:text-status-red"
                >
                  <IconTrash className="size-4" />
                </button>
              )}
            </div>
            <div className="mb-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Fabric *</label>
                <Autocomplete
                  value={f.fabric}
                  onValueChange={(v) => updateFabric(fi, { fabric: v })}
                  suggestions={fabricOptionsFor(fi)}
                  aria-label={`Fabric, block ${fi + 1}`}
                  placeholder="Fabric / quality"
                  className={fieldCls}
                />
              </div>
              <div>
                <label className={labelCls}>Rate</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={f.rate}
                  onChange={(e) => updateFabric(fi, { rate: e.target.value })}
                  aria-label={`Rate per metre, block ${fi + 1}`}
                  placeholder="0.00"
                  className={cn(fieldCls, "text-right font-mono")}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div
                className={cn(
                  "grid gap-2 px-0.5 text-[11px] uppercase tracking-[0.04em] text-text-3",
                  DESIGN_ROW_COLS,
                )}
              >
                <span>Design no *</span>
                <span className="text-right">Qty (m)</span>
                <span className="text-right">Line total</span>
                <span />
              </div>

              {f.designs.map((d, di) => (
                <div
                  key={di}
                  // Enter anywhere in the row inserts the next design and
                  // focuses it — unless the design autocomplete already
                  // consumed Enter to pick a suggestion (defaultPrevented).
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.defaultPrevented) {
                      e.preventDefault();
                      insertDesignAfter(fi, di);
                    }
                  }}
                  className={cn("grid items-center gap-2", DESIGN_ROW_COLS)}
                >
                  <DesignNoInput
                    fabric={f.fabric}
                    value={d.design_no}
                    onValueChange={(v) => updateDesign(fi, di, { design_no: v })}
                    aria-label={`Design no, row ${di + 1}`}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={d.qty_mtr}
                    onChange={(e) =>
                      di === 0
                        ? setFirstDesignQty(fi, e.target.value)
                        : updateDesign(fi, di, { qty_mtr: e.target.value })
                    }
                    aria-label={`Quantity in metres, row ${di + 1}`}
                    className={cn(fieldCls, "px-2 text-right font-mono")}
                  />
                  <div className="truncate pr-1 text-right font-mono text-[12.5px] text-text-2">
                    {formatNumber(blockTotals[fi].rows[di]?.lineTotal ?? 0)}
                  </div>
                  <div className="flex items-center justify-end gap-0.5">
                    <button
                      type="button"
                      onClick={() => insertDesignAfter(fi, di)}
                      aria-label={`Add design below row ${di + 1}`}
                      title="Add design below (or press Enter)"
                      className="hidden size-7 place-items-center rounded-lg text-text-3 hover:bg-surface-2 hover:text-text-1 sm:grid"
                    >
                      <IconPlus className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeDesign(fi, di)}
                      disabled={f.designs.length === 1}
                      aria-label={`Remove design row ${di + 1}`}
                      className="grid size-7 place-items-center rounded-lg text-text-3 hover:text-status-red disabled:pointer-events-none disabled:opacity-30"
                    >
                      <IconTrash className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => addDesign(fi)}>
                  <IconPlus /> Add design
                </Button>
                <BulkAddDesigns onAdd={(n) => addManyDesigns(fi, n)} />
              </div>
              <div className="text-[12px] text-text-3">
                Block qty{" "}
                <span className="font-mono font-semibold text-text-1">
                  {formatNumber(blockTotals[fi].qty)}
                </span>{" "}
                · subtotal{" "}
                <span className="font-mono font-semibold text-text-1">
                  ₹{formatNumber(blockTotals[fi].total)}
                </span>
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setFabrics((fs) => [...fs, emptyFabric()])}
          className="flex w-fit items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12.5px] font-medium text-text-2 hover:bg-surface-2"
        >
          <IconPlus className="size-4" /> Add fabric block
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-status-red/30 bg-status-red-dim px-3.5 py-2.5 text-[13px] text-status-red">
          {error}
        </div>
      )}

      {/* Live totals + actions */}
      <div className={cn(cardCls, "flex flex-wrap items-center justify-between gap-4")}>
        <div>
          <div className="text-[11px] uppercase tracking-[0.04em] text-text-3">
            Grand total
          </div>
          <div className="mt-0.5 font-mono text-[22px] font-semibold tracking-[-0.02em] text-text-1">
            ₹{formatNumber(grandTotal)}
          </div>
        </div>
        <div className="text-[12px] text-text-3">
          {fabrics.length} fabric{fabrics.length === 1 ? "" : "s"} · {designCount} design
          {designCount === 1 ? "" : "s"} ·{" "}
          <span className="font-mono">{formatNumber(grandQty)}</span> m
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? "Saving..." : mode === "create" ? "Create order" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Design-no autocomplete, scoped to its block's fabric. Kept as its own
// component because each row needs its own `useDesigns` subscription (the hook
// caches per fabric, so rows in one block share a single request).
function DesignNoInput({
  fabric,
  value,
  onValueChange,
  "aria-label": ariaLabel,
}: {
  fabric: string;
  value: string;
  onValueChange: (v: string) => void;
  "aria-label": string;
}) {
  const designs = useDesigns(fabric);
  return (
    <Autocomplete
      value={value}
      onValueChange={onValueChange}
      suggestions={designs}
      placeholder="Design no"
      aria-label={ariaLabel}
      className="text-[13px]"
    />
  );
}

// Compact "add N rows at once" control: type a count and press Enter (or click
// Add) to append that many blank design rows.
function BulkAddDesigns({ onAdd }: { onAdd: (count: number) => void }) {
  const [count, setCount] = useState("");
  function commit() {
    const n = Math.floor(Number(count));
    if (!Number.isFinite(n) || n < 1) return;
    onAdd(n);
    setCount("");
  }
  return (
    <div className="flex items-center gap-1.5 text-[12px] text-text-3">
      <span className="hidden sm:inline">Add</span>
      <Input
        type="number"
        min="1"
        max={MAX_BULK_DESIGNS}
        inputMode="numeric"
        value={count}
        onChange={(e) => setCount(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        placeholder="5"
        aria-label="Number of design rows to add"
        className="h-7 w-14 px-2 text-center font-mono text-[12.5px]"
      />
      <span>rows</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={commit}
        disabled={!(Math.floor(Number(count)) >= 1)}
      >
        Add
      </Button>
    </div>
  );
}
