"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const [department, setDepartment] = useState(initial?.department ?? "LD");
  const [remarks, setRemarks] = useState(initial?.remarks ?? "");
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
        department: department.trim() || "LD",
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

  const fieldCls =
    "text-[13px]";

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[10px] border border-border bg-surface px-5 py-[18px]">
        <h2 className="mb-4 text-[14.5px] font-bold text-text-1">Order details</h2>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-[0.04em] text-text-3">
              Order no *
            </label>
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
            <label className="mb-1 block text-[11px] uppercase tracking-[0.04em] text-text-3">
              Order date *
            </label>
            <Input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className={fieldCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-[0.04em] text-text-3">
              Party *
            </label>
            <Input
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              className={fieldCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-[0.04em] text-text-3">
              Sales person
            </label>
            <Input
              value={salesPerson}
              onChange={(e) => setSalesPerson(e.target.value)}
              className={fieldCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-[0.04em] text-text-3">
              Agent
            </label>
            <Input value={agent} onChange={(e) => setAgent(e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-[0.04em] text-text-3">
              Haste
            </label>
            <Input value={haste} onChange={(e) => setHaste(e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-[0.04em] text-text-3">
              Transport
            </label>
            <Input
              value={transport}
              onChange={(e) => setTransport(e.target.value)}
              className={fieldCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-[0.04em] text-text-3">
              Challan no
            </label>
            <Input
              value={challanNo}
              onChange={(e) => setChallanNo(e.target.value)}
              className={fieldCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-[0.04em] text-text-3">
              Lot no
            </label>
            <Input value={lotNo} onChange={(e) => setLotNo(e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-[0.04em] text-text-3">
              Department
            </label>
            <Input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className={fieldCls}
            />
          </div>
        </div>
        <div className="mt-3.5">
          <label className="mb-1 block text-[11px] uppercase tracking-[0.04em] text-text-3">
            Remarks
          </label>
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
          <div
            key={fi}
            className="rounded-[10px] border border-border bg-surface px-5 py-[18px]"
          >
            <div className="mb-3.5 flex items-center justify-between">
              <h3 className="text-[13.5px] font-semibold text-text-1">
                Fabric block {fi + 1}
              </h3>
              {fabrics.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setFabrics((fs) => fs.filter((_, idx) => idx !== fi))
                  }
                  className="text-text-3 hover:text-status-red"
                >
                  <IconTrash className="size-4" />
                </button>
              )}
            </div>
            <div className="mb-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-[0.04em] text-text-3">
                  Fabric *
                </label>
                <Input
                  value={f.fabric}
                  onChange={(e) => updateFabric(fi, { fabric: e.target.value })}
                  className={fieldCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-[0.04em] text-text-3">
                  Rate
                </label>
                <Input
                  type="number"
                  value={f.rate}
                  onChange={(e) => updateFabric(fi, { rate: e.target.value })}
                  className={fieldCls}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {f.designs.map((d, di) => (
                <div key={di} className="flex items-center gap-2">
                  <Input
                    placeholder="Design no"
                    value={d.design_no}
                    onChange={(e) =>
                      updateDesign(fi, di, { design_no: e.target.value })
                    }
                    className={`flex-1 ${fieldCls}`}
                  />
                  <Input
                    type="number"
                    placeholder="Qty (m)"
                    value={d.qty_mtr}
                    onChange={(e) =>
                      updateDesign(fi, di, { qty_mtr: e.target.value })
                    }
                    className={`w-32 ${fieldCls}`}
                  />
                  {f.designs.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        updateFabric(fi, {
                          designs: f.designs.filter((_, idx) => idx !== di),
                        })
                      }
                      className="text-text-3 hover:text-status-red"
                    >
                      <IconTrash className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  updateFabric(fi, {
                    designs: [...f.designs, { design_no: "", qty_mtr: "" }],
                  })
                }
                className="flex w-fit items-center gap-1 text-[12px] font-medium text-accent-text hover:underline"
              >
                <IconPlus className="size-3.5" /> Add design
              </button>
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

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={isPending}>
          {isPending ? "Saving..." : mode === "create" ? "Create order" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
