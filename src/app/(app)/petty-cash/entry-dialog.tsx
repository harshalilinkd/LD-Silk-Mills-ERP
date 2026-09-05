"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  IconPaperclip,
  IconPlus,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";

import { formatDate, todayIso } from "@/lib/dates";
import {
  ATTACHMENT_HELP,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MIME,
  PROOF_TYPES,
  PROOF_TYPE_META,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_META,
  checkAmount,
  formatMoney,
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
  Select,
} from "@/components/ui/module-parts";
import { usePettyCashViewer } from "./viewer-context";
import { addEmployee, createEntry, updateEntry } from "./actions";

export type EntryDraft = {
  id: number;
  transactionDate: string;
  transactionType: TransactionType;
  fromName: string | null;
  employeeId: number;
  categoryId: number;
  reason: string;
  amount: string;
  proofType: ProofType;
  proofOther: string | null;
  attachmentName: string | null;
  hasAttachment: boolean;
};

export type Option = { id: number; name: string };

/**
 * Adding or changing one movement of cash.
 *
 * ── THE ORDER OF THE FIELDS IS THE ORDER OF THE THOUGHT ──────────────────
 *
 * Date → in or out → how much → who → what for → proof. That is the sequence
 * somebody standing at a desk with a bill in their hand actually goes through,
 * and it is the order the spec asks for. The amount is lifted up beside the
 * direction because those two together are the whole point of the entry; proof
 * comes last because it is the part most often skipped.
 *
 * ── THE DIRECTION IS TWO BUTTONS, NOT A DROPDOWN ─────────────────────────
 *
 * There are exactly two, they are the single most consequential choice on the
 * form, and a dropdown hides the one that is not selected. Money out and money
 * in are also coloured, so a mis-set entry is visible before it is saved
 * rather than after it has moved the balance.
 */
export function EntryDialog({
  open,
  onClose,
  draft,
  employees,
  categories,
  fromOptions,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Null to create. */
  draft: EntryDraft | null;
  employees: Option[];
  categories: (Option & { groupName: string })[];
  fromOptions: string[];
  onSaved: (message: string) => void;
}) {
  const viewer = usePettyCashViewer();
  const router = useRouter();
  const editing = draft !== null;

  const [date, setDate] = React.useState(draft?.transactionDate ?? todayIso());
  const [type, setType] = React.useState<TransactionType>(
    draft?.transactionType ?? "DEBIT",
  );
  const [amount, setAmount] = React.useState(draft?.amount ?? "");
  const [fromName, setFromName] = React.useState(draft?.fromName ?? "");
  const [typingFrom, setTypingFrom] = React.useState(
    () => !!draft?.fromName && !fromOptions.includes(draft.fromName),
  );
  const [employeeId, setEmployeeId] = React.useState(
    draft ? String(draft.employeeId) : "",
  );
  const [categoryId, setCategoryId] = React.useState(
    draft ? String(draft.categoryId) : "",
  );
  const [reason, setReason] = React.useState(draft?.reason ?? "");
  const [proofType, setProofType] = React.useState<ProofType>(draft?.proofType ?? "NONE");
  const [proofOther, setProofOther] = React.useState(draft?.proofOther ?? "");
  const [file, setFile] = React.useState<File | null>(null);
  const [removeAttachment, setRemoveAttachment] = React.useState(false);

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [addingPayee, setAddingPayee] = React.useState(false);

  const amountCheck = checkAmount(amount);
  const ready =
    date.length === 10 && amountCheck.ok && !!employeeId && !!categoryId && reason.trim().length > 0;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("transactionDate", date);
      fd.set("transactionType", type);
      fd.set("fromName", fromName.trim());
      fd.set("employeeId", employeeId);
      fd.set("categoryId", categoryId);
      fd.set("reason", reason);
      fd.set("amount", amount);
      fd.set("proofType", proofType);
      fd.set("proofOther", proofType === "OTHER" ? proofOther : "");
      if (file) fd.set("attachment", file);
      if (removeAttachment && !file) fd.set("removeAttachment", "1");

      if (editing) {
        await updateEntry(draft.id, fd);
        onSaved("Transaction updated successfully.");
      } else {
        const r = await createEntry(fd);
        onSaved(`Transaction ${r.uid} created successfully.`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The entry could not be saved.");
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={editing ? `Edit ${draft.id ? "transaction" : ""}`.trim() : "New transaction"}
        subtitle={
          editing
            ? "The reference and who first recorded it never change."
            : undefined
        }
        footer={
          <>
            <DialogCancel onClick={onClose} disabled={busy} />
            <DialogSave onClick={save} busy={busy} disabled={!ready}>
              {editing ? "Save changes" : "Save transaction"}
            </DialogSave>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {/* ── 1. the movement ──────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date" hint="Defaults to today.">
              <Input
                type="date"
                className="num"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>

            <Field
              label="Amount"
              hint={
                amount && !amountCheck.ok
                  ? undefined
                  : amountCheck.ok
                    ? formatMoney(amountCheck.value)
                    : "Rupees, e.g. 1250 or 1250.50"
              }
            >
              <Input
                inputMode="decimal"
                className="num"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                aria-invalid={!!amount && !amountCheck.ok}
              />
            </Field>
          </div>

          {!!amount && !amountCheck.ok && (
            <p className="-mt-2 text-[12px] text-status-red">{amountCheck.error}</p>
          )}

          <Field label="Money in or out">
            <div className="grid grid-cols-2 gap-2">
              {TRANSACTION_TYPES.map((t) => {
                const m = TRANSACTION_TYPE_META[t];
                const on = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setType(t)}
                    className={cn(
                      "cursor-pointer rounded-field border px-3 py-2.5 text-left transition-colors",
                      on
                        ? t === "DEBIT"
                          ? "border-status-red/40 bg-status-red-dim"
                          : "border-status-green/40 bg-status-green-dim"
                        : "border-border bg-surface hover:border-border-strong",
                    )}
                  >
                    <span
                      className={cn(
                        "block text-[13px] font-semibold",
                        on ? m.text : "text-text-1",
                      )}
                    >
                      {m.label}
                    </span>
                    <span className="block text-[11.5px] leading-snug text-text-3">
                      {m.help}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>

          {/* ── 2. the parties ───────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From" hint="Who handed the money over. Optional.">
              {typingFrom ? (
                <div className="flex gap-2">
                  <Input
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder="Name or entity"
                    autoFocus
                  />
                  {fromOptions.length > 0 && (
                    <QuietButton
                      className="h-9 shrink-0"
                      onClick={() => {
                        setTypingFrom(false);
                        setFromName("");
                      }}
                    >
                      List
                    </QuietButton>
                  )}
                </div>
              ) : (
                <Select
                  value={fromName}
                  onChange={(e) =>
                    e.target.value === "__new__"
                      ? (setTypingFrom(true), setFromName(""))
                      : setFromName(e.target.value)
                  }
                >
                  <option value="">Not recorded</option>
                  {fromOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                  <option value="__new__">+ Someone else…</option>
                </Select>
              )}
            </Field>

            <Field label="To" hint="Who received it.">
              <div className="flex gap-2">
                <Select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                >
                  <option value="">Choose a person…</option>
                  {employees.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                {viewer.can.manageMasters && (
                  <QuietButton
                    className="h-9 shrink-0"
                    aria-label="Add a new payee"
                    onClick={() => setAddingPayee(true)}
                  >
                    <IconPlus className="size-3.5" />
                  </QuietButton>
                )}
              </div>
            </Field>
          </div>

          {/* ── 3. what it was for ───────────────────────────────────── */}
          <Field label="Category">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Choose a category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.groupName !== c.name ? ` · ${c.groupName}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="What was it for">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Transport charges for machine parts"
              className="w-full resize-y rounded-field border border-border bg-surface px-2.5 py-2 text-[13px] text-text-1 outline-none placeholder:text-text-placeholder focus:border-primary/50 focus:ring-3 focus:ring-primary/15"
            />
          </Field>

          {/* ── 4. proof ─────────────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Proof kept">
              <Select
                value={proofType}
                onChange={(e) => setProofType(e.target.value as ProofType)}
              >
                {PROOF_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {PROOF_TYPE_META[p].label}
                  </option>
                ))}
              </Select>
            </Field>

            {proofType === "OTHER" && (
              <Field label="What kind">
                <Input
                  value={proofOther}
                  onChange={(e) => setProofOther(e.target.value)}
                  placeholder="Kaccha slip, WhatsApp message…"
                />
              </Field>
            )}
          </div>

          <Field label="Receipt (optional)" hint={ATTACHMENT_HELP}>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-field border border-border bg-surface px-2.5 text-[12.5px] font-medium text-text-2 transition-colors hover:bg-surface-2 hover:text-text-1">
                <IconUpload className="size-3.5" />
                {file ? "Choose a different file" : "Attach a file"}
                <input
                  type="file"
                  className="hidden"
                  accept={ATTACHMENT_MIME.join(",")}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setError(null);
                    // `accept` only filters the picker. A drag-drop, an "All
                    // files" pick or a phone's share sheet all get past it, and
                    // the server then refuses the upload — correctly, but after
                    // a round trip and with nothing on screen until it returns.
                    // Saying it here is the same rule, said sooner.
                    if (f && !ATTACHMENT_MIME.includes(f.type as never)) {
                      setError(`A ${f.name.split(".").pop()?.toUpperCase() ?? "file"} cannot be attached. ${ATTACHMENT_HELP}`);
                      e.target.value = "";
                      return;
                    }
                    if (f && f.size > ATTACHMENT_MAX_BYTES) {
                      setError("That file is larger than 10 MB.");
                      e.target.value = "";
                      return;
                    }
                    setFile(f);
                    setRemoveAttachment(false);
                    e.target.value = "";
                  }}
                />
              </label>

              {file && (
                <span className="inline-flex items-center gap-1.5 text-[12.5px] text-text-2">
                  <IconPaperclip className="size-3.5 text-text-3" />
                  {file.name}
                  <button
                    type="button"
                    aria-label="Remove the chosen file"
                    onClick={() => setFile(null)}
                    className="cursor-pointer text-text-3 hover:text-status-red"
                  >
                    <IconTrash className="size-3.5" />
                  </button>
                </span>
              )}

              {/* An existing receipt, when nothing new has been chosen. */}
              {!file && editing && draft.hasAttachment && !removeAttachment && (
                <span className="inline-flex items-center gap-1.5 text-[12.5px] text-text-2">
                  <IconPaperclip className="size-3.5 text-text-3" />
                  {draft.attachmentName ?? "Receipt"}
                  <button
                    type="button"
                    onClick={() => setRemoveAttachment(true)}
                    className="cursor-pointer text-[12px] text-status-red hover:underline"
                  >
                    Remove
                  </button>
                </span>
              )}

              {removeAttachment && !file && (
                <span className="text-[12.5px] text-status-amber">
                  The receipt will be removed when you save.
                </span>
              )}
            </div>
          </Field>

          <ErrorNote>{error}</ErrorNote>

          {/* A last look at what is about to be recorded. The two things that
              move money — the direction and the figure — restated together, so
              a debit typed as a credit is caught before it is saved.

              The BOX is neutral and only the figure carries the colour. Tinting
              the whole strip red for a debit made it read as a second error
              whenever it sat under a real one, which is the opposite of what a
              confirmation is for. */}
          {ready && (
            <p className="rounded-field border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text-2">
              {type === "DEBIT" ? "Paying out" : "Taking in"}{" "}
              <strong
                className={cn("num font-bold", TRANSACTION_TYPE_META[type].text)}
              >
                {formatMoney(amountCheck.value)}
              </strong>{" "}
              on {formatDate(date)}
              {employees.find((e) => String(e.id) === employeeId)
                ? ` — ${employees.find((e) => String(e.id) === employeeId)!.name}`
                : ""}
              .
            </p>
          )}
        </div>
      </Modal>

      {addingPayee && (
        <AddPayeeDialog
          onClose={() => setAddingPayee(false)}
          onAdded={(id) => {
            setEmployeeId(String(id));
            setAddingPayee(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/**
 * Adding a payee without leaving the entry.
 *
 * The old app has this and it earns its place: somebody paying a rickshaw
 * driver should not have to abandon a half-filled form to go and create a
 * person. The new payee is selected on the way back, so the flow continues
 * where it left off.
 */
function AddPayeeDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (id: number) => void;
}) {
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await addEmployee(name, code || null);
      onAdded(r.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That person could not be added.");
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New payee"
      subtitle="Somebody money can be paid to. They do not need an ERP login."
      footer={
        <>
          <DialogCancel onClick={onClose} disabled={busy} />
          <DialogSave onClick={save} busy={busy} disabled={!name.trim()}>
            Add payee
          </DialogSave>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="Full name"
          />
        </Field>
        <Field label="Staff number (optional)" hint="The old sheet's Emp-ID, if they have one.">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="AB-02" />
        </Field>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
