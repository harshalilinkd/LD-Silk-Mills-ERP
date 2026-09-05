"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  IconExternalLink,
  IconLoader2,
  IconPaperclip,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";

import { formatDateLong } from "@/lib/dates";
import {
  TRANSACTION_TYPE_META,
  formatMoney,
  proofLabel,
  type ProofType,
  type TransactionType,
} from "@/lib/petty-cash/money";
import { cn } from "@/lib/utils";
import {
  DialogCancel,
  DialogSave,
  ErrorNote,
  Field,
  Input,
  Modal,
  QuietButton,
} from "@/components/ui/module-parts";
import { usePettyCashViewer } from "./viewer-context";
import { deleteEntry } from "./actions";
import type { EntryDraft } from "./entry-dialog";

type Detail = {
  id: number;
  uid: string;
  transactionDate: string;
  transactionType: TransactionType;
  fromName: string | null;
  toName: string;
  employeeId: number;
  categoryId: number;
  categoryName: string;
  reason: string;
  amount: string;
  proofType: ProofType;
  proofOther: string | null;
  hasAttachment: boolean;
  attachmentName: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
};

/**
 * One entry, in full.
 *
 * ── THE AMOUNT IS THE HEADLINE ───────────────────────────────────────────
 *
 * Somebody opening a line is nearly always checking one thing: how much, which
 * way, and what for. Those three are the top of the panel at a size you can
 * read across a desk; the metadata that matters only in an argument — who
 * entered it, who changed it — sits at the bottom.
 */
export function EntryDetail({
  id,
  onClose,
  onEdit,
  onDeleted,
}: {
  id: number;
  onClose: () => void;
  onEdit: (draft: EntryDraft) => void;
  onDeleted: (uid: string) => void;
}) {
  const viewer = usePettyCashViewer();
  const router = useRouter();
  const [row, setRow] = React.useState<Detail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/petty-cash/entries/${id}`, { cache: "no-store" });
        if (!res.ok) throw new Error("That entry could not be loaded.");
        const data = (await res.json()) as Detail;
        if (alive) setRow(data);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "That entry could not be loaded.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const meta = row ? TRANSACTION_TYPE_META[row.transactionType] : null;

  return (
    <>
      <Modal
        open={!confirming}
        onClose={onClose}
        title={row ? row.uid : "Transaction"}
        subtitle={row ? formatDateLong(row.transactionDate) : undefined}
        footer={
          row ? (
            <>
              {viewer.can.delete && (
                <QuietButton tone="danger" className="mr-auto h-9" onClick={() => setConfirming(true)}>
                  <IconTrash className="size-3.5" />
                  Delete
                </QuietButton>
              )}
              <DialogCancel onClick={onClose}>Close</DialogCancel>
              {viewer.can.edit && (
                <DialogSave
                  onClick={() =>
                    onEdit({
                      id: row.id,
                      transactionDate: row.transactionDate,
                      transactionType: row.transactionType,
                      fromName: row.fromName,
                      employeeId: row.employeeId,
                      categoryId: row.categoryId,
                      reason: row.reason,
                      amount: row.amount,
                      proofType: row.proofType,
                      proofOther: row.proofOther,
                      attachmentName: row.attachmentName,
                      hasAttachment: row.hasAttachment,
                    })
                  }
                >
                  <IconPencil className="size-3.5" />
                  Edit
                </DialogSave>
              )}
            </>
          ) : undefined
        }
      >
        {!row ? (
          <div className="flex items-center gap-2 py-6 text-[13px] text-text-3">
            <IconLoader2 className="size-4 animate-spin" />
            Loading transaction…
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div
              className={cn(
                "rounded-card border px-4 py-3",
                row.transactionType === "DEBIT"
                  ? "border-status-red/30 bg-status-red-dim"
                  : "border-status-green/30 bg-status-green-dim",
              )}
            >
              <div className={cn("text-[11px] font-bold tracking-[0.06em] uppercase", meta!.text)}>
                {meta!.label}
              </div>
              <div className={cn("num mt-1 text-[30px] leading-none font-bold", meta!.text)}>
                {formatMoney(row.amount)}
              </div>
              <div className="mt-1.5 text-[12.5px] text-text-2">
                {row.categoryName} · {formatDateLong(row.transactionDate)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Line label="From" value={row.fromName ?? "Not recorded"} />
              <Line label="To" value={row.toName} strong />
            </div>

            <Line label="What it was for" value={row.reason} block />

            <div className="grid grid-cols-2 gap-3">
              <Line label="Proof" value={proofLabel(row.proofType, row.proofOther)} />
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="text-[13px] font-medium text-text-2">Receipt</span>
                {row.hasAttachment ? (
                  <a
                    href={`/api/petty-cash/entries/${row.id}/attachment`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center gap-1.5 rounded-field border border-border bg-surface px-2.5 py-1.5 text-[12.5px] font-medium text-text-2 transition-colors hover:bg-surface-2 hover:text-text-1"
                  >
                    <IconPaperclip className="size-3.5" />
                    {row.attachmentName ?? "View receipt"}
                    <IconExternalLink className="size-3 text-text-3" />
                  </a>
                ) : (
                  <span className="text-[13px] text-text-3">No attachments found.</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
              <Line
                label="Recorded by"
                value={`${row.createdByName ?? "Unknown"} · ${stamp(row.createdAt)}`}
                muted
              />
              {row.updatedAt !== row.createdAt && (
                <Line
                  label="Last changed by"
                  value={`${row.updatedByName ?? "Unknown"} · ${stamp(row.updatedAt)}`}
                  muted
                />
              )}
            </div>

            <ErrorNote>{error}</ErrorNote>
          </div>
        )}

        {!row && <ErrorNote>{error}</ErrorNote>}
      </Modal>

      {confirming && row && (
        <DeleteDialog
          row={row}
          onCancel={() => setConfirming(false)}
          onDone={(uid) => {
            setConfirming(false);
            onDeleted(uid);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/**
 * Deleting, with the entry restated.
 *
 * The confirmation repeats the amount, the category and the date rather than
 * asking "are you sure?" about nothing. It also says plainly what happens —
 * the entry leaves the views and the balance but is kept for audit — because a
 * soft delete that pretends to be a hard one is a promise the screen cannot
 * keep.
 */
function DeleteDialog({
  row,
  onCancel,
  onDone,
}: {
  row: Detail;
  onCancel: () => void;
  onDone: (uid: string) => void;
}) {
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await deleteEntry(row.id, note || null);
      onDone(r.uid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That entry could not be deleted.");
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title="Delete this transaction?"
      subtitle={row.uid}
      footer={
        <>
          <DialogCancel onClick={onCancel} disabled={busy} />
          <DialogSave destructive onClick={go} busy={busy}>
            Delete
          </DialogSave>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="rounded-field border border-border bg-surface-2 px-3 py-2.5">
          <div className="num text-[19px] font-bold text-text-1">
            {formatMoney(row.amount)}
          </div>
          <div className="mt-0.5 text-[12.5px] text-text-3">
            {row.categoryName} · {row.toName} · {formatDateLong(row.transactionDate)}
          </div>
        </div>

        <p className="text-[13px] leading-relaxed text-text-2">
          It will leave the ledger, the balance and every total. It is{" "}
          <strong className="font-semibold text-text-1">kept for audit</strong> —
          this is money, so nothing here destroys a record — and the receipt is
          kept with it.
        </p>

        <Field label="Why (optional)" hint="Recorded on the audit entry.">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Entered twice by mistake"
          />
        </Field>

        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

function Line({
  label,
  value,
  strong,
  muted,
  block,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  block?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", block && "col-span-full")}>
      <span className="text-[13px] font-medium text-text-2">{label}</span>
      <span
        className={cn(
          "text-[13px] break-words",
          strong ? "font-semibold text-text-1" : muted ? "text-text-3" : "text-text-1",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** `5 Sep 2026, 14:32` in Bhiwandi's time, not the browser's. */
function stamp(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}
