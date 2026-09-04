"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { IconPlus, IconTrash } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ENTRY_FOR_OPTIONS, RETURN_REASONS } from "@/lib/goods-return/constants";
import { MasterPicker } from "./master-picker";

/**
 * The entry form — every field from the standalone app, same rules, rebuilt.
 *
 * ── NO FORM LIBRARY, DELIBERATELY ────────────────────────────────────────
 *
 * The original uses react-hook-form + zodResolver + sonner. None of the three
 * is a dependency of this shell, and CLAUDE.md is explicit that there is no
 * toast library here — every message in a ported module is an inline banner.
 * Adding two packages for one screen is weight every page then carries, so this
 * is plain state, and the SAME zod schema still validates on the server. The
 * client checks are only there to point at the offending field before a round
 * trip; `returnInputSchema` remains the thing that decides.
 *
 * ── WHAT THE ORIGINAL GOT RIGHT AND IS KEPT ──────────────────────────────
 *
 *   · Broker depends on Party, via `party_brokers`.
 *   · "Other" as a reason requires the free-text reason.
 *   · At least one quality line, each needing a quality and a quantity.
 *   · Inline "add" on every picker.
 *
 * ── WHAT IS ADDED ────────────────────────────────────────────────────────
 *
 * A running total. The three amounts are entered separately and the number
 * that matters — what this return is worth in total — was never shown until
 * the record was saved and reopened.
 */
export type ItemRow = { qualityId: string; qualityName: string; quantity: string; pieces: string };

export type FormValues = {
  billNo: string;
  entryFor: string;
  trackingNo: string;
  dated: string;
  postedOn: string;
  partyId: string;
  partyName: string;
  brokerId: string;
  brokerName: string;
  transportId: string;
  transportName: string;
  totalValue: string;
  transportValue: string;
  otherCharges: string;
  returnReason: string;
  customReason: string;
  items: ItemRow[];
};

export const blankItem: ItemRow = {
  qualityId: "",
  qualityName: "",
  quantity: "",
  pieces: "",
};

export const blankForm: FormValues = {
  billNo: "",
  entryFor: "",
  trackingNo: "",
  dated: "",
  postedOn: "",
  partyId: "",
  partyName: "",
  brokerId: "",
  brokerName: "",
  transportId: "",
  transportName: "",
  totalValue: "",
  transportValue: "",
  otherCharges: "",
  returnReason: "",
  customReason: "",
  items: [{ ...blankItem }],
};

const LABEL = "text-[12.5px] font-medium text-text-2";
const FIELD =
  "h-9 w-full rounded-field border border-border bg-surface px-2.5 text-[12.5px] text-text-1 outline-none transition-colors focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40";

function Row({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className={LABEL}>
        {label}
        {required && <span className="ml-0.5 text-status-red">*</span>}
      </span>
      {children}
      {error && <span className="text-[11.5px] text-status-red">{error}</span>}
    </label>
  );
}

function Panel({
  title,
  children,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-[14px] font-bold text-text-1">{title}</h2>
        {aside}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function ReturnForm({
  mode,
  initial,
  submit,
}: {
  mode: "create" | "edit";
  initial?: FormValues;
  submit: (fd: FormData) => Promise<{ error?: string; displayId?: string; id?: number }>;
}) {
  const router = useRouter();
  const [v, setV] = React.useState<FormValues>(initial ?? blankForm);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [banner, setBanner] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) =>
    setV((s) => ({ ...s, [k]: val }));

  const setItem = (i: number, patch: Partial<ItemRow>) =>
    setV((s) => ({
      ...s,
      items: s.items.map((it, n) => (n === i ? { ...it, ...patch } : it)),
    }));

  const num = (x: string) => {
    const n = Number(String(x).replace(/[₹,\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const runningTotal =
    num(v.totalValue) + num(v.transportValue) + num(v.otherCharges);

  /**
   * The client-side pass. It exists to put a message under the right box, not
   * to decide anything — the server re-validates with the same zod schema and
   * that is what actually refuses a bad record.
   */
  const validate = () => {
    const e: Record<string, string> = {};
    if (!v.entryFor) e.entryFor = "Choose what this entry is for.";
    if (!v.dated) e.dated = "A date is required.";
    if (!v.partyId) e.partyId = "Choose a party.";
    if (!v.brokerId) e.brokerId = "Choose a broker.";
    if (!v.returnReason) e.returnReason = "Choose a reason.";
    if (v.returnReason === "Other" && !v.customReason.trim())
      e.customReason = "Please say what the reason is.";
    v.items.forEach((it, i) => {
      if (!it.qualityId) e[`item-${i}-quality`] = "Choose a quality.";
      if (!it.quantity.trim() || Number(it.quantity) <= 0)
        e[`item-${i}-quantity`] = "Enter a quantity above 0.";
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = (formEl: HTMLFormElement) => {
    setBanner(null);
    if (!validate()) {
      setBanner("Some details are missing — see the fields marked below.");
      return;
    }
    const fd = new FormData(formEl);
    // The quality lines travel as JSON: a repeating row group has no native
    // FormData shape, and this is what `parseReturnFormData` expects.
    fd.set(
      "items",
      JSON.stringify(
        v.items.map((it) => ({
          qualityId: it.qualityId,
          quantity: it.quantity,
          pieces: it.pieces === "" ? undefined : it.pieces,
        })),
      ),
    );
    start(async () => {
      const res = await submit(fd);
      if (res.error) {
        setBanner(res.error);
        return;
      }
      // Both modes land on the detail page — after a create it is the record
      // just made, after an edit the one just changed. Somebody who has just
      // typed a return wants to SEE it, not be dropped back on a list.
      router.push(`/goods-return/returns/${res.id}`);
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(e.currentTarget);
      }}
      className="flex flex-col gap-4"
    >
      {/* Hidden inputs carry the picker ids, so the FormData shape matches
          exactly what the server action parses. */}
      <input type="hidden" name="partyId" value={v.partyId} />
      <input type="hidden" name="brokerId" value={v.brokerId} />
      <input type="hidden" name="transportId" value={v.transportId} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Basic details">
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            <Row label="Entry for" required error={errors.entryFor}>
              <select
                name="entryFor"
                value={v.entryFor}
                onChange={(e) => set("entryFor", e.target.value)}
                className={cn(FIELD, errors.entryFor && "border-status-red/60")}
              >
                <option value="">Select an option</option>
                {ENTRY_FOR_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Date" required error={errors.dated}>
              <input
                type="date"
                name="dated"
                value={v.dated}
                onChange={(e) => set("dated", e.target.value)}
                className={cn(FIELD, "num", errors.dated && "border-status-red/60")}
              />
            </Row>

            <Row label="Bill no">
              <Input
                name="billNo"
                value={v.billNo}
                onChange={(e) => set("billNo", e.target.value)}
                placeholder="If any"
                className="h-9"
              />
            </Row>

            <Row label="LR / tracking no">
              <Input
                name="trackingNo"
                value={v.trackingNo}
                onChange={(e) => set("trackingNo", e.target.value)}
                placeholder="If any"
                className="h-9 num"
              />
            </Row>

            <Row label="Posted to Bhiwandi on">
              <input
                type="date"
                name="postedOn"
                value={v.postedOn}
                onChange={(e) => set("postedOn", e.target.value)}
                className={cn(FIELD, "num")}
              />
            </Row>

            <Row label="Attachment">
              <input
                type="file"
                name="attachment"
                accept="image/*,application/pdf"
                className="block w-full text-[12px] text-text-2 file:mr-2 file:cursor-pointer file:rounded-field file:border file:border-border file:bg-surface-2 file:px-2.5 file:py-1.5 file:text-[12px] file:font-medium file:text-text-1"
              />
            </Row>
          </div>
        </Panel>

        <Panel title="Party details">
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            <Row label="Party" required error={errors.partyId}>
              <MasterPicker
                type="parties"
                value={v.partyId}
                label={v.partyName}
                invalid={!!errors.partyId}
                placeholder="Search party…"
                onChange={({ id, name }) =>
                  // Changing the party CLEARS the broker: the old one may not
                  // trade for the new party, and silently keeping it is the
                  // exact mistake party_brokers exists to prevent.
                  setV((s) => ({
                    ...s,
                    partyId: id,
                    partyName: name,
                    brokerId: "",
                    brokerName: "",
                  }))
                }
              />
            </Row>

            <Row label="Broker" required error={errors.brokerId}>
              <MasterPicker
                type="brokers"
                value={v.brokerId}
                label={v.brokerName}
                partyId={v.partyId}
                disabled={!v.partyId}
                disabledHint="Choose a party first"
                invalid={!!errors.brokerId}
                placeholder="Search broker…"
                onChange={({ id, name }) =>
                  setV((s) => ({ ...s, brokerId: id, brokerName: name }))
                }
              />
            </Row>
          </div>
        </Panel>
      </div>

      <Panel
        title="Quality lines"
        aside={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() =>
              setV((s) => ({ ...s, items: [...s.items, { ...blankItem }] }))
            }
          >
            <IconPlus className="size-3.5" /> Add line
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {v.items.map((it, i) => (
            <div
              key={i}
              className="grid gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_120px_100px_auto] sm:items-end"
            >
              <Row
                label={i === 0 ? "Quality" : ""}
                required={i === 0}
                error={errors[`item-${i}-quality`]}
              >
                <MasterPicker
                  type="qualities"
                  value={it.qualityId}
                  label={it.qualityName}
                  invalid={!!errors[`item-${i}-quality`]}
                  placeholder="Search quality…"
                  onChange={({ id, name }) =>
                    setItem(i, { qualityId: id, qualityName: name })
                  }
                />
              </Row>

              <Row
                label={i === 0 ? "Quantity (mtr)" : ""}
                required={i === 0}
                error={errors[`item-${i}-quantity`]}
              >
                <Input
                  inputMode="decimal"
                  value={it.quantity}
                  onChange={(e) => setItem(i, { quantity: e.target.value })}
                  placeholder="0.000"
                  className={cn(
                    "h-9 num",
                    errors[`item-${i}-quantity`] && "border-status-red/60",
                  )}
                />
              </Row>

              <Row label={i === 0 ? "Pieces" : ""}>
                <Input
                  inputMode="numeric"
                  value={it.pieces}
                  onChange={(e) => setItem(i, { pieces: e.target.value })}
                  placeholder="Optional"
                  className="h-9 num"
                />
              </Row>

              <button
                type="button"
                aria-label={`Remove line ${i + 1}`}
                disabled={v.items.length === 1}
                onClick={() =>
                  setV((s) => ({
                    ...s,
                    items: s.items.filter((_, n) => n !== i),
                  }))
                }
                className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-field border border-border text-text-3 transition-colors hover:border-status-red/40 hover:text-status-red disabled:cursor-not-allowed disabled:opacity-40"
              >
                <IconTrash className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Transport & amounts">
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Row label="Transport">
            <MasterPicker
              type="transports"
              value={v.transportId}
              label={v.transportName}
              placeholder="Search transport… (optional)"
              onChange={({ id, name }) =>
                setV((s) => ({ ...s, transportId: id, transportName: name }))
              }
            />
          </Row>

          <Row label="Total billing amount">
            <Input
              name="totalValue"
              inputMode="decimal"
              value={v.totalValue}
              onChange={(e) => set("totalValue", e.target.value)}
              placeholder="0.00"
              className="h-9 num"
            />
          </Row>

          <Row label="Transport (LR) amount">
            <Input
              name="transportValue"
              inputMode="decimal"
              value={v.transportValue}
              onChange={(e) => set("transportValue", e.target.value)}
              placeholder="0.00"
              className="h-9 num"
            />
          </Row>

          <Row label="Other charges">
            <Input
              name="otherCharges"
              inputMode="decimal"
              value={v.otherCharges}
              onChange={(e) => set("otherCharges", e.target.value)}
              placeholder="0.00"
              className="h-9 num"
            />
          </Row>

          <Row label="Reason of return" required error={errors.returnReason}>
            <select
              name="returnReason"
              value={v.returnReason}
              onChange={(e) => set("returnReason", e.target.value)}
              className={cn(
                FIELD,
                errors.returnReason && "border-status-red/60",
              )}
            >
              <option value="">Select a reason</option>
              {RETURN_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Row>

          {v.returnReason === "Other" && (
            <Row label="Say what the reason is" required error={errors.customReason}>
              <Input
                name="customReason"
                value={v.customReason}
                onChange={(e) => set("customReason", e.target.value)}
                className={cn("h-9", errors.customReason && "border-status-red/60")}
              />
            </Row>
          )}
        </div>

        {runningTotal > 0 && (
          <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-border pt-3">
            <span className="text-[12.5px] text-text-3">
              Billing + transport + other charges
            </span>
            <span className="num text-[16px] font-bold text-text-1">
              ₹
              {runningTotal.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        )}
      </Panel>

      {banner && (
        <p
          role="alert"
          className="rounded-field border border-status-red/30 bg-status-red-dim px-3 py-2 text-[12.5px] text-status-red"
        >
          {banner}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-4">
        <Button type="submit" disabled={pending} className="h-9">
          {pending
            ? "Saving…"
            : mode === "edit"
              ? "Save changes"
              : "Submit return"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-9"
          disabled={pending}
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <span className="text-[12px] text-text-3">
          {mode === "edit"
            ? "The LD number, status and Bhiwandi's figures are not changed by an edit."
            : "An LD-#### number is assigned automatically."}
        </span>
      </div>
    </form>
  );
}
