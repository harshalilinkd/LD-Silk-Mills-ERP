"use client";

// New / edit order form — docs/SCREENS.md §2, ported to this app's tokens
// (docs/DESIGN.md). One header + N fabric blocks, each block holding one
// fabric, one rate and M design rows (§2.1): a customer orders "3,000 m of
// INDIANA CHECKS in six colours" — one fabric, one rate, six design numbers —
// and typing the fabric and rate six times is how order entry gets abandoned.
//
// EVERY field is held as a string, including the numeric ones. A controlled
// <input type="number"> bound to a number cannot represent "", "3." or "0.0"
// mid-typing — it snaps back and the user loses the keystroke. Conversion
// happens once, in buildPayload().

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconCheck,
  IconClipboardList,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Reveal } from "@/components/ui/reveal";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/order-entry/orders";
import { Autocomplete } from "./autocomplete";
import { useDesigns, useLookup } from "./use-lookups";

type DesignRow = { design_no: string; qty_mtr: string };
type FabricBlock = { fabric: string; rate: string; designs: DesignRow[] };
type HeaderState = {
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
};

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
  fabrics: {
    fabric: string;
    rate: number | null;
    designs: { design_no: string; qty_mtr: number }[];
  }[];
};

type DupStatus = "idle" | "checking" | "available" | "taken" | "error";

const todayISO = () => new Date().toISOString().slice(0, 10);
const blankDesign = (): DesignRow => ({ design_no: "", qty_mtr: "" });
const blankFabric = (): FabricBlock => ({
  fabric: "",
  rate: "",
  designs: [blankDesign()],
});
// Default party for new orders (§2.1) — a pre-fill, not a catalog constraint;
// party stays free text and is cleared/replaced freely.
const DEFAULT_PARTY = "LD Silk Mills";

// Guard-rail so a fat-fingered bulk count can't spawn thousands of rows.
const MAX_BULK_DESIGNS = 100;
// localStorage key for the in-progress "new order" draft, so a refresh (or an
// accidental tab close) never loses typed-in data (§2.13). Create mode only —
// edit mode is hydrated from the server. Bump the suffix if the shape changes.
const NEW_ORDER_DRAFT_KEY = "oe:new-order-draft:v1";

// Column template shared by the design-row header strip and the rows, declared
// once so the two can never drift (§2.6). The action column is narrow on mobile
// (remove only) and widens at sm where the per-row + also shows — on a phone
// those 32px go to the design input instead.
const DESIGN_ROW_COLS =
  "grid-cols-[minmax(0,1fr)_4rem_5.5rem_2.5rem] sm:grid-cols-[minmax(0,1fr)_4rem_5.5rem_4.5rem]";

// Preview-dialog table head, styled as docs/DESIGN.md's `th`.
const previewThCls =
  "px-3 py-2 text-[11px] font-semibold tracking-[0.04em] text-text-3 uppercase";

// The spec's `glass` ground. This app has no glass utility, so the nearest
// honest equivalent is the card surface, slightly translucent.
//
// The blur is on the sticky bar ONLY, and deliberately not on the panels:
// `backdrop-filter` creates a stacking context, and this app's Autocomplete
// renders its dropdown in place rather than portalling it — a permanent
// stacking context around a fabric block would trap the suggestion list
// (z-50) below the fixed totals bar (z-30).
const GLASS_PANEL = "bg-surface/95";
const GLASS_BAR = "bg-surface/95 backdrop-blur-[6px]";
// The brand gradient from docs/DESIGN.md (the sidebar brand mark) stands in for
// the spec's `from-accent to-[var(--a3)]` — this app has no --a3.
const BRAND_GRADIENT = "linear-gradient(160deg, var(--primary), #0d9488)";

function initialHeader(initial: InitialData | undefined): HeaderState {
  return {
    order_no: initial?.order_no ?? "",
    order_date: initial?.order_date ?? todayISO(),
    party_name: initial?.party_name ?? DEFAULT_PARTY,
    sales_person: initial?.sales_person ?? "",
    agent: initial?.agent ?? "",
    haste: initial?.haste ?? "",
    transport: initial?.transport ?? "",
    challan_no: initial?.challan_no ?? "",
    lot_no: initial?.lot_no ?? "",
    // Department is NOT a user-editable field — the form this was ported from
    // never showed one (§2.3). Everything this app writes is "LD"; an order
    // that already carries a department keeps it rather than being silently
    // rewritten on an unrelated edit.
    department: initial?.department?.trim() || "LD",
    remarks: initial?.remarks ?? "",
  };
}

function initialBlocks(initial: InitialData | undefined): FabricBlock[] {
  if (!initial?.fabrics.length) return [blankFabric()];
  return initial.fabrics.map((f) => ({
    fabric: f.fabric,
    rate: f.rate == null ? "" : String(f.rate),
    designs: f.designs.length
      ? f.designs.map((d) => ({
          design_no: d.design_no,
          qty_mtr: String(d.qty_mtr),
        }))
      : [blankDesign()],
  }));
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

  // Edit-mode hydration (§2.14) deliberately differs from the spec: the page is
  // a server component that has already loaded the order and passes it in as
  // `initial`, so there is no client fetch, no loading/error branch, and no
  // `hydrated.current` guard needed — a lazy useState initialiser cannot be
  // clobbered by a refetch the way the spec's effect could.
  const [header, setHeader] = useState<HeaderState>(() =>
    initialHeader(initial),
  );
  const [blocks, setBlocks] = useState<FabricBlock[]>(() =>
    initialBlocks(initial),
  );
  const [dup, setDup] = useState<DupStatus>("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  // An order is allowed to keep its own number — see checkOrderNo().
  const originalOrderNo = initial?.order_no ?? "";

  // After adding design rows we focus the first new row's Design-no input so
  // the user can keep typing without reaching for the mouse (§2.7.4). The input
  // is located by its block-scoped aria-label once the new row has rendered —
  // that label and the block's data attribute are the addressing scheme, not
  // just accessibility.
  const [pendingFocus, setPendingFocus] = useState<{
    bi: number;
    di: number;
  } | null>(null);
  useEffect(() => {
    if (!pendingFocus) return;
    const { bi, di } = pendingFocus;
    const el = document.querySelector<HTMLInputElement>(
      `[data-fabric-block="${bi}"] input[aria-label="Design no, row ${di + 1}"]`,
    );
    el?.focus();
    setPendingFocus(null);
  }, [pendingFocus, blocks]);

  // ---- Draft autosave, create mode only (§2.13) ----
  // Restore any saved draft on mount, then persist every change so a hard
  // refresh keeps the typed-in data. `draftReady` gates persistence until the
  // restore pass has run. It is STATE, not a ref, deliberately: a ref would
  // already read `true` during the same commit as the restore, and the persist
  // effect would overwrite the saved draft with the blank initial state before
  // the restore landed. That bug only shows up on a real refresh.
  const [draftReady, setDraftReady] = useState(false);
  useEffect(() => {
    if (mode !== "create") {
      setDraftReady(true);
      return;
    }
    try {
      const raw = localStorage.getItem(NEW_ORDER_DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as {
          header?: Partial<HeaderState>;
          blocks?: FabricBlock[];
        };
        // Merged rather than replaced, so a draft written before a field was
        // added can't leave that field `undefined` in a controlled input.
        if (d?.header) setHeader((h) => ({ ...h, ...d.header }));
        // Same reasoning for the blocks: a half-written draft must not crash
        // the render on `b.designs.map`.
        const restored = Array.isArray(d?.blocks)
          ? d.blocks.filter(
              (b): b is FabricBlock =>
                !!b &&
                typeof b.fabric === "string" &&
                typeof b.rate === "string" &&
                Array.isArray(b.designs) &&
                b.designs.length > 0 &&
                // Every value stays a string all the way through (§2.1), and a
                // draft that says otherwise would blow up on `.trim()`.
                b.designs.every(
                  (row) =>
                    typeof row?.design_no === "string" &&
                    typeof row?.qty_mtr === "string",
                ),
            )
          : [];
        if (restored.length) setBlocks(restored);
      }
    } catch {
      // Corrupt / unavailable draft → start fresh.
    }
    setDraftReady(true);
  }, [mode]);
  useEffect(() => {
    if (!draftReady || mode !== "create") return;
    try {
      localStorage.setItem(
        NEW_ORDER_DRAFT_KEY,
        JSON.stringify({ header, blocks }),
      );
    } catch {
      // Ignore quota / privacy-mode failures — the draft just won't persist.
    }
  }, [draftReady, mode, header, blocks]);

  // Master lists behind the autocompletes (suggestions only — a value that
  // isn't in the list is always accepted).
  const parties = useLookup("PARTY");
  const salesPeople = useLookup("SALES_PERSON");
  const agents = useLookup("AGENT");
  const hastes = useLookup("HASTE");
  const transports = useLookup("TRANSPORT");
  const fabricNames = useLookup("FABRIC");

  function setHeaderField<K extends keyof HeaderState>(
    key: K,
    value: HeaderState[K],
  ) {
    setHeader((h) => ({ ...h, [key]: value }));
  }

  // ---- Fabric block / design row mutators ----
  function updateBlock(bi: number, patch: Partial<FabricBlock>) {
    setBlocks((bs) => bs.map((b, idx) => (idx === bi ? { ...b, ...patch } : b)));
  }
  function addBlock() {
    setBlocks((bs) => [...bs, blankFabric()]);
  }
  function removeBlock(bi: number) {
    setBlocks((bs) =>
      bs.length === 1 ? bs : bs.filter((_, idx) => idx !== bi),
    );
  }
  function updateDesign(bi: number, di: number, patch: Partial<DesignRow>) {
    setBlocks((bs) =>
      bs.map((b, idx) =>
        idx !== bi
          ? b
          : {
              ...b,
              designs: b.designs.map((d, j) =>
                j === di ? { ...d, ...patch } : d,
              ),
            },
      ),
    );
  }

  // New design rows inherit the block's qty (row 0's value) so the common case
  // — one fabric in six colours, one quantity six times — needs no re-typing.
  const inheritedQty = (b: FabricBlock) => b.designs[0]?.qty_mtr ?? "";

  function addDesign(bi: number) {
    const at = blocks[bi]?.designs.length ?? 0;
    setBlocks((bs) =>
      bs.map((b, idx) =>
        idx === bi
          ? {
              ...b,
              designs: [
                ...b.designs,
                { design_no: "", qty_mtr: inheritedQty(b) },
              ],
            }
          : b,
      ),
    );
    setPendingFocus({ bi, di: at });
  }

  // Insert a blank design directly below row `di` and focus it — used by the
  // per-row + button and by pressing Enter inside a design row.
  function insertDesignAfter(bi: number, di: number) {
    setBlocks((bs) =>
      bs.map((b, idx) => {
        if (idx !== bi) return b;
        const designs = [...b.designs];
        designs.splice(di + 1, 0, { design_no: "", qty_mtr: inheritedQty(b) });
        return { ...b, designs };
      }),
    );
    setPendingFocus({ bi, di: di + 1 });
  }

  // Append `count` blank design rows at once (the "add 5 rows" shortcut).
  function addManyDesigns(bi: number, count: number) {
    const n = Math.min(Math.max(Math.floor(count), 1), MAX_BULK_DESIGNS);
    const start = blocks[bi]?.designs.length ?? 0;
    setBlocks((bs) =>
      bs.map((b, idx) =>
        idx === bi
          ? {
              ...b,
              designs: [
                ...b.designs,
                ...Array.from({ length: n }, () => ({
                  design_no: "",
                  qty_mtr: inheritedQty(b),
                })),
              ],
            }
          : b,
      ),
    );
    setPendingFocus({ bi, di: start });
  }

  // Editing the FIRST design's qty cascades to the block's other rows, but only
  // those still holding the previous common value (or still empty) — a manually
  // overridden per-row qty is preserved.
  function setFirstDesignQty(bi: number, value: string) {
    setBlocks((bs) =>
      bs.map((b, idx) => {
        if (idx !== bi) return b;
        const prev = b.designs[0]?.qty_mtr ?? "";
        return {
          ...b,
          designs: b.designs.map((d, j) =>
            j === 0
              ? { ...d, qty_mtr: value }
              : d.qty_mtr === "" || d.qty_mtr === prev
                ? { ...d, qty_mtr: value }
                : d,
          ),
        };
      }),
    );
  }

  function removeDesign(bi: number, di: number) {
    setBlocks((bs) =>
      bs.map((b, idx) =>
        idx === bi
          ? {
              ...b,
              designs:
                b.designs.length === 1
                  ? b.designs
                  : b.designs.filter((_, j) => j !== di),
            }
          : b,
      ),
    );
  }

  // A fabric already chosen in one block is dropped from the OTHER blocks'
  // suggestions so the same fabric isn't picked twice. Free text is still
  // accepted — this only prunes the dropdown.
  function fabricOptionsFor(bi: number) {
    const takenElsewhere = new Set(
      blocks
        .filter((_, idx) => idx !== bi)
        .map((b) => b.fabric.trim().toLowerCase())
        .filter(Boolean),
    );
    return fabricNames.filter((f) => !takenElsewhere.has(f.toLowerCase()));
  }

  // ---- Live totals (§2.9) ----
  // Computed on every render, not memoised. NOTHING here is ever sent:
  // line_total is a generated column and the order total is derived. These
  // figures exist only to be looked at.
  const blockTotals = blocks.map((b) => {
    const rate = Number(b.rate) || 0;
    const rows = b.designs.map((d) => {
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
  const designCount = blocks.reduce((s, b) => s + b.designs.length, 0);

  // ---- Order-no duplicate check, on blur (§2.4) ----
  // Never per keystroke: order_no is user-entered and UNIQUE, and a check per
  // character is both noisy and pointless mid-word.
  async function checkOrderNo() {
    const value = header.order_no.trim();
    if (!value) {
      setDup("idle");
      return;
    }
    // An order is allowed to keep its own number — no request needed.
    if (mode === "edit" && value === originalOrderNo) {
      setDup("available");
      return;
    }
    setDup("checking");
    try {
      const res = await fetch(
        `/api/order-entry/orders/check-no?orderNo=${encodeURIComponent(value)}`,
      );
      const body = (await res.json().catch(() => null)) as {
        data?: { available?: boolean };
      } | null;
      if (!res.ok || typeof body?.data?.available !== "boolean") {
        setDup("error");
        return;
      }
      setDup(body.data.available ? "available" : "taken");
    } catch {
      setDup("error");
    }
  }

  // ---- Build payload + validate (§2.10) ----
  // buildPayload runs BEFORE validation and does the cleaning: trim everything,
  // "" → null for the optional header fields, rate "" → null, and drop design
  // rows that are entirely blank. That last rule is what makes "add 5 rows"
  // safe — unused rows disappear rather than failing validation. A row with a
  // qty but no design no (or the reverse) is NOT blank: it survives, so
  // validation can reject it instead of silently dropping typed-in data.
  function buildPayload() {
    const cleanedBlocks = blocks.map((b) => ({
      fabric: b.fabric.trim(),
      rate: b.rate.trim() === "" ? null : Number(b.rate),
      designs: b.designs
        .filter((d) => d.design_no.trim() !== "" || d.qty_mtr.trim() !== "")
        .map((d) => ({
          design_no: d.design_no.trim(),
          // "" would become Number("") === 0 and slip past as a real quantity;
          // NaN cannot, and validation's `> 0` test rejects it by name.
          qty_mtr: d.qty_mtr.trim() === "" ? Number.NaN : Number(d.qty_mtr),
        })),
    }));
    return {
      order: {
        order_no: header.order_no.trim(),
        order_date: header.order_date,
        // Party names pass through verbatim apart from the trim — never
        // case-folded, expanded or tidied.
        party_name: header.party_name.trim(),
        sales_person: header.sales_person.trim() || null,
        agent: header.agent.trim() || null,
        haste: header.haste.trim() || null,
        transport: header.transport.trim() || null,
        challan_no: header.challan_no.trim() || null,
        lot_no: header.lot_no.trim() || null,
        department: header.department.trim() || "LD",
        remarks: header.remarks.trim() || null,
      },
      fabrics: cleanedBlocks,
    };
  }

  // Returns the FIRST failure as a sentence, or null.
  function validate(): string | null {
    if (!header.order_no.trim()) return "Order no is required.";
    if (!header.order_date) return "Order date is required.";
    if (!header.party_name.trim()) return "Party is required.";
    // Blocking on `taken` means a race that lets the user submit before the
    // blur resolves still cannot write a duplicate — the table's unique
    // constraint is the third line of defence.
    if (dup === "taken")
      return `Order number "${header.order_no.trim()}" already exists.`;
    const payload = buildPayload();
    if (payload.fabrics.length === 0) return "Add at least one fabric block.";
    for (const [i, f] of payload.fabrics.entries()) {
      if (!f.fabric) return `Fabric block ${i + 1}: fabric is required.`;
      if (f.designs.length === 0)
        return `Fabric block ${i + 1}: add at least one design row.`;
      for (const d of f.designs) {
        if (!d.design_no)
          return `Fabric block ${i + 1}: every design row needs a design no.`;
        if (!(d.qty_mtr > 0))
          return `Fabric block ${i + 1}: qty must be greater than 0.`;
      }
    }
    return null;
  }

  // Submitting the form opens the confirmation dialog; only the dialog's own
  // button writes (§2.2). There is no toast system in this app, so the message
  // lives only in the inline banner above the totals bar.
  function openPreview() {
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    setPreviewOpen(true);
  }

  function confirmSave() {
    startTransition(async () => {
      const url =
        mode === "create"
          ? "/api/order-entry/orders"
          : `/api/order-entry/orders/${orderId}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      // The dialog closes either way — deliberately, so an error message is not
      // hidden behind it.
      setPreviewOpen(false);
      if (!res.ok) {
        setFormError(body?.error ?? "Failed to save order");
        return;
      }
      if (mode === "create") {
        // Saved — discard the local draft so the next New order starts blank.
        try {
          localStorage.removeItem(NEW_ORDER_DRAFT_KEY);
        } catch {
          // Nothing to clean up if storage is unavailable.
        }
      }
      // router.refresh() is this app's cache invalidation: the orders list is
      // server-rendered, so there are no client query caches to evict.
      router.push("/order-entry/orders");
      router.refresh();
    });
  }

  const payload = buildPayload();

  return (
    <form
      className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 pb-[124px] sm:pb-[104px]"
      onSubmit={(e) => {
        e.preventDefault();
        openPreview();
      }}
    >
      {/* Region A — order details. The bottom padding above is not decoration:
          the totals bar is position:fixed, so without it the last fabric block
          sits underneath and cannot be reached. Mobile needs more (124 vs 104)
          because the bar wraps to two rows there. */}
      <Reveal index={0}>
        <div
          className={cn(
            GLASS_PANEL,
            "flex flex-col gap-3 rounded-card border border-border p-3 sm:p-4",
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-accent text-accent-text ring-1 ring-accent-text/15 ring-inset">
                <IconClipboardList className="size-4" />
              </span>
              <h2 className="text-[14.5px] font-bold text-text-1">
                Order details
              </h2>
            </div>
            {mode === "edit" ? <Eyebrow>Editing</Eyebrow> : null}
          </div>

          {/* The [&_input]:h-9 override matters — the global Input is smaller
              than the 36px this screen wants for its eleven fields. */}
          <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 sm:gap-x-4 lg:grid-cols-3 [&_input]:h-9">
            <Field label="Order date" htmlFor="order_date" required>
              <Input
                id="order_date"
                type="date"
                className="num"
                value={header.order_date}
                onChange={(e) => setHeaderField("order_date", e.target.value)}
              />
            </Field>

            <Field
              label="Order no"
              htmlFor="order_no"
              required
              hint={
                dup === "checking"
                  ? "Checking…"
                  : dup === "taken"
                    ? "Already exists"
                    : dup === "available"
                      ? "Available"
                      : undefined
              }
              hintTone={
                dup === "taken"
                  ? "danger"
                  : dup === "available"
                    ? "success"
                    : "muted"
              }
            >
              <Input
                id="order_no"
                className="num"
                value={header.order_no}
                aria-invalid={dup === "taken"}
                // Any edit invalidates the last answer; the check re-runs on
                // blur.
                onChange={(e) => {
                  setHeaderField("order_no", e.target.value);
                  setDup("idle");
                }}
                onBlur={checkOrderNo}
              />
            </Field>

            <Field label="Party" htmlFor="party_name" required>
              <Autocomplete
                id="party_name"
                value={header.party_name}
                onValueChange={(v) => setHeaderField("party_name", v)}
                suggestions={parties}
                placeholder="Party name"
              />
            </Field>

            <Field label="Sales person" htmlFor="sales_person">
              <Autocomplete
                id="sales_person"
                value={header.sales_person}
                onValueChange={(v) => setHeaderField("sales_person", v)}
                suggestions={salesPeople}
                placeholder="Search…"
              />
            </Field>

            <Field label="Agent" htmlFor="agent">
              <Autocomplete
                id="agent"
                value={header.agent}
                onValueChange={(v) => setHeaderField("agent", v)}
                suggestions={agents}
                placeholder="Search…"
              />
            </Field>

            {/* Haste is a COMPANY NAME, not an urgency flag. */}
            <Field label="Haste" htmlFor="haste">
              <Autocomplete
                id="haste"
                value={header.haste}
                onValueChange={(v) => setHeaderField("haste", v)}
                suggestions={hastes}
                placeholder="Search…"
              />
            </Field>

            <Field label="Transport" htmlFor="transport">
              <Autocomplete
                id="transport"
                value={header.transport}
                onValueChange={(v) => setHeaderField("transport", v)}
                suggestions={transports}
                placeholder="Search…"
              />
            </Field>

            <Field label="Challan no" htmlFor="challan_no">
              <Input
                id="challan_no"
                value={header.challan_no}
                onChange={(e) => setHeaderField("challan_no", e.target.value)}
                placeholder="—"
              />
            </Field>

            <Field label="Lot no" htmlFor="lot_no">
              <Input
                id="lot_no"
                value={header.lot_no}
                onChange={(e) => setHeaderField("lot_no", e.target.value)}
                placeholder="—"
              />
            </Field>

            <Field
              label="Remarks"
              htmlFor="remarks"
              className="col-span-1 sm:col-span-2 lg:col-span-3"
            >
              <Input
                id="remarks"
                value={header.remarks}
                onChange={(e) => setHeaderField("remarks", e.target.value)}
                placeholder="Optional notes"
              />
            </Field>
          </div>
        </div>
      </Reveal>

      {/* Region B — fabric blocks */}
      {blocks.map((block, bi) => (
        <Reveal key={bi} index={bi + 1}>
          <div
            data-fabric-block={bi}
            className={cn(
              GLASS_PANEL,
              "relative rounded-card border border-border-strong p-3 shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-[2px] hover:shadow-md motion-reduce:hover:translate-y-0 sm:p-4",
            )}
          >
            {/* The two decorations are clipped by their OWN overflow-hidden
                layer rather than by the block: this app's Autocomplete renders
                its dropdown in place (it does not portal), so overflow-hidden
                on the container would clip every suggestion list. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-card"
            >
              <span
                className="absolute inset-y-0 left-0 w-1"
                style={{ background: BRAND_GRADIENT }}
              />
              <span
                className="absolute -top-12 -right-12 size-32 rounded-full opacity-[0.05]"
                style={{
                  background:
                    "radial-gradient(circle, var(--primary), transparent 70%)",
                }}
              />
            </span>

            <div className="relative mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[14px] font-semibold text-text-1">
                <span
                  className="num grid size-[24px] place-items-center rounded-[7px] text-[12.5px] font-semibold text-primary-foreground shadow-sm"
                  style={{ background: BRAND_GRADIENT }}
                >
                  {bi + 1}
                </span>
                Fabric block
              </div>
              {/* Rendered and disabled rather than hidden when there is only
                  one block — an order always has at least one, and the
                  disabled affordance says so. */}
              <button
                type="button"
                onClick={() => removeBlock(bi)}
                disabled={blocks.length === 1}
                aria-label={`Remove fabric block ${bi + 1}`}
                className="inline-flex items-center gap-1.5 rounded-field px-2 py-1.5 text-[13px] font-medium text-text-3 transition-colors hover:bg-status-red-dim hover:text-status-red disabled:pointer-events-none disabled:opacity-40"
              >
                <IconTrash className="size-[15px]" /> Remove
              </button>
            </div>

            {/* Shared block fields (one fabric + rate per block), then an
                aligned list of design rows. The columns fit the viewport, so
                mobile never needs horizontal scrolling. */}
            <div className="relative flex flex-col gap-2.5">
              <div className="grid grid-cols-[1fr_6rem] gap-2.5 sm:grid-cols-[minmax(180px,1.6fr)_120px]">
                <Field label="Fabric" required>
                  <Autocomplete
                    value={block.fabric}
                    onValueChange={(v) => updateBlock(bi, { fabric: v })}
                    suggestions={fabricOptionsFor(bi)}
                    placeholder="Fabric / quality"
                    aria-label={`Fabric, block ${bi + 1}`}
                    className="h-10 text-[13.5px]"
                  />
                </Field>
                <Field label="Rate">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="num h-10 px-2 text-right text-[13.5px]"
                    value={block.rate}
                    onChange={(e) => updateBlock(bi, { rate: e.target.value })}
                    placeholder="0.00"
                    aria-label={`Rate per metre, block ${bi + 1}`}
                  />
                </Field>
              </div>

              <div className="flex flex-col gap-1.5">
                <div
                  className={cn(
                    "grid gap-2 px-0.5 text-[11px] font-semibold tracking-[0.04em] text-text-3 uppercase",
                    DESIGN_ROW_COLS,
                  )}
                >
                  <span>
                    Design no<span className="text-status-red"> *</span>
                  </span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Total</span>
                  <span />
                </div>

                {block.designs.map((d, di) => (
                  <div
                    key={di}
                    // Enter anywhere in the row inserts the next design and
                    // focuses it — unless the design autocomplete already
                    // consumed Enter to pick a suggestion (defaultPrevented),
                    // so choosing a design does not also spawn a row.
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.defaultPrevented) {
                        e.preventDefault();
                        insertDesignAfter(bi, di);
                      }
                    }}
                    className={cn("grid items-center gap-2", DESIGN_ROW_COLS)}
                  >
                    <DesignNoInput
                      fabric={block.fabric}
                      value={d.design_no}
                      onValueChange={(v) =>
                        updateDesign(bi, di, { design_no: v })
                      }
                      aria-label={`Design no, row ${di + 1}`}
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="num h-10 px-2 text-right text-[13.5px]"
                      value={d.qty_mtr}
                      onChange={(e) =>
                        di === 0
                          ? setFirstDesignQty(bi, e.target.value)
                          : updateDesign(bi, di, { qty_mtr: e.target.value })
                      }
                      placeholder="0"
                      aria-label={`Quantity in metres, row ${di + 1}`}
                    />
                    <div className="flex h-9 items-center justify-end pr-0.5 text-[13px] font-medium text-text-1">
                      <Money value={blockTotals[bi].rows[di]?.lineTotal ?? 0} />
                    </div>
                    <div className="flex h-9 items-center justify-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => insertDesignAfter(bi, di)}
                        aria-label="Add design below"
                        title="Add design (or press Enter)"
                        className="hidden size-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-accent hover:text-accent-text sm:grid"
                      >
                        <IconPlus className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeDesign(bi, di)}
                        disabled={block.designs.length === 1}
                        aria-label="Remove design"
                        className="grid size-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-status-red-dim hover:text-status-red disabled:pointer-events-none disabled:opacity-30"
                      >
                        <IconTrash className="size-[15px]" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-border-strong pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addDesign(bi)}
                >
                  <IconPlus /> Add design
                </Button>
                <BulkAddDesigns onAdd={(n) => addManyDesigns(bi, n)} />
              </div>
              <div className="text-[13px] text-text-2">
                Block qty{" "}
                <b className="num text-[14px] font-semibold text-text-1">
                  {formatNumber(blockTotals[bi].qty)}
                </b>{" "}
                · subtotal{" "}
                <b className="text-[14px] font-semibold text-text-1">
                  <Money value={blockTotals[bi].total} />
                </b>
              </div>
            </div>
          </div>
        </Reveal>
      ))}

      {/* Region C — add fabric block */}
      <Reveal index={blocks.length + 1}>
        <button
          type="button"
          onClick={addBlock}
          className="flex h-[46px] w-full items-center justify-center gap-2 rounded-field border border-dashed border-border-strong bg-surface-2 text-[14px] font-medium text-text-1 transition-[color,background-color,border-color] hover:border-primary hover:bg-accent hover:text-accent-text active:scale-[.99]"
        >
          <IconPlus className="size-4" /> Add fabric block
        </button>
      </Reveal>

      {/* The banner may be scrolled off on a long order; there is no toast
          system in this app to back it up. */}
      {formError ? (
        <p
          role="alert"
          className="rounded-field bg-status-red-dim px-3.5 py-2.5 text-sm text-status-red"
        >
          {formError}
        </p>
      ) : null}

      {/* Region D — sticky totals bar. md:left-[264px] clears the expanded
          sidebar (src/components/shell/sidebar.tsx is w-[264px], hidden below
          md — the same breakpoint). */}
      <div
        className={cn(
          GLASS_BAR,
          "fixed inset-x-0 bottom-0 z-30 border-t border-border px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] sm:px-[34px] sm:py-4 md:left-[264px] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.45)]",
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
        />
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-3.5">
            <span className="text-[12px] font-semibold tracking-[0.08em] text-accent-text uppercase">
              Grand total
            </span>
            <span className="text-2xl font-semibold tracking-[-0.02em] text-text-1 sm:text-[30px]">
              <Money value={grandTotal} />
            </span>
          </div>
          <div className="hidden text-[13px] text-text-2 md:block">
            {blocks.length} fabric · {designCount} design
            {designCount === 1 ? "" : "s"} · {formatNumber(grandQty)} mtr
          </div>
          <div className="flex gap-3 [&>*]:flex-1 sm:[&>*]:flex-none">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="border border-border-strong"
              onClick={() => router.push("/order-entry/orders")}
            >
              Cancel
            </Button>
            <Button type="submit" size="lg">
              <IconCheck />{" "}
              {mode === "create" ? "Create order" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>

      {/* Preview dialog (§2.11) — opened by submit, never skipped. */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[85dvh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "Confirm new order" : "Confirm changes"}
            </DialogTitle>
            <DialogDescription>
              Review the order before saving.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Detail term="Order no" value={payload.order.order_no} mono />
              <Detail term="Order date" value={payload.order.order_date} mono />
              <Detail term="Party" value={payload.order.party_name} />
              <Detail
                term="Sales person"
                value={payload.order.sales_person ?? "—"}
              />
              <Detail
                term="Challan no"
                value={payload.order.challan_no ?? "—"}
              />
              <Detail term="Lot no" value={payload.order.lot_no ?? "—"} />
            </dl>

            <div className="overflow-x-auto rounded-field border border-border">
              <table className="w-full min-w-[440px] text-left text-sm">
                <thead className="bg-chip">
                  <tr>
                    <th className={previewThCls}>Fabric</th>
                    <th className={previewThCls}>Design</th>
                    <th className={cn(previewThCls, "text-right")}>Qty</th>
                    <th className={cn(previewThCls, "text-right")}>Rate</th>
                    <th className={cn(previewThCls, "text-right")}>
                      Line total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payload.fabrics.flatMap((f, fi) =>
                    f.designs.map((d, di) => (
                      <tr key={`${fi}-${di}`} className="border-t border-border">
                        <td className="px-3 py-2 text-text-1">{f.fabric}</td>
                        <td className="px-3 py-2 text-text-1">{d.design_no}</td>
                        <td className="num px-3 py-2 text-right text-text-1">
                          {formatNumber(d.qty_mtr)}
                        </td>
                        <td className="num px-3 py-2 text-right text-text-1">
                          {f.rate == null ? "—" : formatNumber(f.rate)}
                        </td>
                        <td className="num px-3 py-2 text-right text-text-1">
                          {formatNumber((f.rate ?? 0) * d.qty_mtr)}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-chip font-medium text-text-1">
                    <td className="px-3 py-2" colSpan={2}>
                      Grand total
                    </td>
                    <td className="num px-3 py-2 text-right">
                      {formatNumber(grandQty)}
                    </td>
                    <td className="px-3 py-2" />
                    <td className="num px-3 py-2 text-right">
                      ₹{formatNumber(grandTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreviewOpen(false)}
              disabled={isPending}
            >
              Back
            </Button>
            <Button type="button" onClick={confirmSave} disabled={isPending}>
              {isPending ? (
                <>
                  <Spinner /> Saving…
                </>
              ) : mode === "create" ? (
                "Confirm & create"
              ) : (
                "Confirm & save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

// Design-no autocomplete, scoped to its block's fabric. Kept as its own
// component because each row needs its own useDesigns subscription (the hook
// caches per fabric and debounces it by 350ms, so rows in one block share a
// single request and typing "INDIANA CHECKS" doesn't fire fourteen queries).
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
      className="h-10 text-[13.5px]"
    />
  );
}

// Compact "add N rows at once" control: type a count and press Enter (or click
// Add) to append that many blank design rows. Its count lives in its own
// component so a per-block draft value never re-renders the whole form.
function BulkAddDesigns({ onAdd }: { onAdd: (count: number) => void }) {
  const [count, setCount] = useState("");
  function commit() {
    const n = Math.floor(Number(count));
    if (!Number.isFinite(n) || n < 1) return;
    onAdd(n);
    setCount("");
  }
  return (
    <div className="flex items-center gap-1.5 text-[13px] text-text-2">
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
        className="num h-8 w-16 px-2 text-center text-[13px]"
      />
      <span>rows</span>
      <Button
        type="button"
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

// Label + control, with the hint on the LABEL ROW, right-aligned — not under
// the input, where it would shift every field below it as it appears and
// disappears (§2.3).
function Field({
  label,
  htmlFor,
  required,
  hint,
  hintTone = "muted",
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  hintTone?: "muted" | "danger" | "success";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-[7px]", className)}>
      <div className="flex items-center justify-between">
        <label
          htmlFor={htmlFor}
          className="text-[13px] font-medium text-text-2"
        >
          {label}
          {required ? (
            <span className="font-semibold text-status-red"> *</span>
          ) : null}
        </label>
        {hint ? (
          <span
            className={cn(
              "text-xs",
              hintTone === "danger"
                ? "text-status-red"
                : hintTone === "success"
                  ? "text-status-green"
                  : "text-text-3",
            )}
          >
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Detail({
  term,
  value,
  mono,
}: {
  term: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-text-3">{term}</dt>
      <dd className={cn("font-medium text-text-1", mono && "num")}>{value}</dd>
    </div>
  );
}
