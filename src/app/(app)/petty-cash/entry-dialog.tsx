"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowsExchange,
  IconPaperclip,
  IconPlus,
  IconTrash,
  IconUpload,
  IconUsers,
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
  SectionHead,
  Select,
  Textarea,
} from "@/components/ui/module-parts";
import { usePettyCashViewer } from "./viewer-context";
import {
  addEmployee,
  createEntry,
  startReceiptUpload,
  updateEntry,
} from "./actions";

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
      // ── the receipt goes straight to storage, not through the action ────
      //
      // A file inside a server action's FormData is capped at 1 MB by Next and
      // at 4.5 MB by Vercel before our code even runs — which is what the very
      // first real receipt hit. So the bytes are PUT to a one-use signed URL
      // the server issues, and the form carries nothing but the path.
      let receipt: { path: string; sig: string; name: string } | null = null;
      if (file) {
        const up = await startReceiptUpload(date, file.name, file.type, file.size);
        const put = await fetch(up.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!put.ok) throw new Error("The receipt could not be uploaded. Please try again.");
        receipt = { path: up.path, sig: up.signature, name: up.name };
      }

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
      if (receipt) {
        fd.set("attachmentPath", receipt.path);
        fd.set("attachmentSig", receipt.sig);
        fd.set("attachmentName", receipt.name);
      }
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
        wide
        title={editing ? "Edit transaction" : "New transaction"}
        subtitle={
          editing ? "The reference and who first recorded it never change." : undefined
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
          {/* ══ 1. the movement ═══════════════════════════════════════════
              Date, amount and direction on ONE row. These three are the
              entry: everything below them describes a movement that has
              already been decided by the time somebody reaches this dialog. */}
          <section className="flex flex-col gap-3">
            <SectionHead icon={<IconArrowsExchange className="size-4" />}>
              The movement
            </SectionHead>

            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Date" htmlFor="pc_date" required>
                <Input
                  id="pc_date"
                  type="date"
                  className="num"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>

              <Field
                label="Amount"
                htmlFor="pc_amount"
                required
                hint={
                  amount && !amountCheck.ok
                    ? amountCheck.error
                    : amountCheck.ok
                      ? formatMoney(amountCheck.value)
                      : "In rupees"
                }
                hintTone={
                  amount && !amountCheck.ok
                    ? "danger"
                    : amountCheck.ok
                      ? "success"
                      : "muted"
                }
              >
                <Input
                  id="pc_amount"
                  inputMode="decimal"
                  className="num"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  aria-invalid={!!amount && !amountCheck.ok}
                />
              </Field>

              {/* Two buttons rather than a dropdown: there are exactly two,
                  it is the most consequential choice on the form, and a
                  dropdown hides the one that is not selected. They sit at the
                  same 36px as the fields beside them so the row is level. */}
              <Field label="Money in or out" required>
                <div className="grid grid-cols-2 gap-2">
                  {TRANSACTION_TYPES.map((t) => {
                    const m = TRANSACTION_TYPE_META[t];
                    const on = type === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={on}
                        title={m.help}
                        onClick={() => setType(t)}
                        className={cn(
                          "flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-field border px-2 text-[12.5px] font-semibold transition-colors",
                          on
                            ? t === "DEBIT"
                              ? cn("border-status-red/40 bg-status-red-dim", m.text)
                              : cn("border-status-green/40 bg-status-green-dim", m.text)
                            : "border-border bg-surface text-text-2 hover:border-border-strong hover:text-text-1",
                        )}
                      >
                        {/* The same arrows the ledger puts on Total debit and
                            Total credit, so the direction is recognisable
                            before the word is read. */}
                        {t === "DEBIT" ? (
                          <IconArrowUp className="size-3.5" />
                        ) : (
                          <IconArrowDown className="size-3.5" />
                        )}
                        {m.short}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
          </section>

          {/* ══ 2. who and what for ═══════════════════════════════════════ */}
          <section className="flex flex-col gap-3 border-t border-border pt-4">
            <SectionHead icon={<IconUsers className="size-4" />}>
              Who, and what for
            </SectionHead>

            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="From" htmlFor="pc_from" hint="Optional">
                {typingFrom ? (
                  <div className="flex gap-2">
                    <Input
                      id="pc_from"
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
                    id="pc_from"
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

              <Field label="To" htmlFor="pc_to" required>
                <div className="flex gap-2">
                  <Select
                    id="pc_to"
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

              <Field label="Category" htmlFor="pc_category" required>
                <Select
                  id="pc_category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Choose a category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.groupName !== c.name ? ` · ${c.groupName}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>

              {/* Across two columns, because a reason worth reading is longer
                  than a name. Its height is set to match the pair of stacked
                  fields beside it so the row bottoms out level. */}
              <Field
                label="What was it for"
                htmlFor="pc_reason"
                required
                className="sm:col-span-2"
              >
                <Textarea
                  id="pc_reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Transport charges for machine parts"
                />
              </Field>

              <Field label="Proof kept" htmlFor="pc_proof">
                <Select
                  id="pc_proof"
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
            </div>
          </section>

          {/* ══ 3. the paperwork ══════════════════════════════════════════ */}
          <section className="flex flex-col gap-3 border-t border-border pt-4">
            <SectionHead icon={<IconPaperclip className="size-4" />}>
              The paperwork
            </SectionHead>

            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
              {proofType === "OTHER" && (
                <Field label="What kind of proof" htmlFor="pc_proof_other" required>
                  <Input
                    id="pc_proof_other"
                    value={proofOther}
                    onChange={(e) => setProofOther(e.target.value)}
                    placeholder="Kaccha slip, WhatsApp…"
                  />
                </Field>
              )}

              <Field
                label="Receipt"
                className={proofType === "OTHER" ? "sm:col-span-2" : "sm:col-span-3"}
              >
                <div className="flex h-9 flex-wrap items-center gap-2">
                  <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-field border border-border bg-surface px-2.5 text-[12.5px] font-medium text-text-2 transition-colors hover:bg-surface-2 hover:text-text-1">
                    <IconUpload className="size-3.5" />
                    {file ? "Choose a different file" : "Attach a file"}
                    <input
                      type="file"
                      className="hidden"
                      accept={ATTACHMENT_MIME.join(",")}
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        setError(null);
                        // `accept` only filters the picker. A drag-drop, an
                        // "All files" pick or a phone's share sheet all get
                        // past it, and the server then refuses the upload —
                        // correctly, but after a round trip and with nothing
                        // on screen until it returns. Saying it here is the
                        // same rule, said sooner.
                        if (f && !ATTACHMENT_MIME.includes(f.type as never)) {
                          setError(
                            `A ${f.name.split(".").pop()?.toUpperCase() ?? "file"} cannot be attached. ${ATTACHMENT_HELP}`,
                          );
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

                  {file ? (
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-text-2">
                      <IconPaperclip className="size-3.5 shrink-0 text-text-3" />
                      <span className="truncate">{file.name}</span>
                      <button
                        type="button"
                        aria-label="Remove the chosen file"
                        onClick={() => setFile(null)}
                        className="shrink-0 cursor-pointer text-text-3 hover:text-status-red"
                      >
                        <IconTrash className="size-3.5" />
                      </button>
                    </span>
                  ) : editing && draft.hasAttachment && !removeAttachment ? (
                    /* An existing receipt, when nothing new has been chosen. */
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-text-2">
                      <IconPaperclip className="size-3.5 shrink-0 text-text-3" />
                      <span className="truncate">{draft.attachmentName ?? "Receipt"}</span>
                      <button
                        type="button"
                        onClick={() => setRemoveAttachment(true)}
                        className="shrink-0 cursor-pointer text-[12px] text-status-red hover:underline"
                      >
                        Remove
                      </button>
                    </span>
                  ) : removeAttachment ? (
                    <span className="text-[12.5px] text-status-amber">
                      The receipt will be removed when you save.
                    </span>
                  ) : (
                    <span className="truncate text-[12px] text-text-3">
                      {ATTACHMENT_HELP}
                    </span>
                  )}
                </div>
              </Field>
            </div>
          </section>

          <ErrorNote>{error}</ErrorNote>

          {/* A last look at what is about to be recorded. The two things that
              move money — the direction and the figure — restated together, so
              a debit typed as a credit is caught before it is saved.

              The BOX is neutral and only the figure carries the colour.
              Tinting the whole strip red for a debit made it read as a second
              error whenever it sat under a real one, which is the opposite of
              what a confirmation is for. */}
          {ready && (
            <p className="rounded-field border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text-2">
              {type === "DEBIT" ? "Paying out" : "Taking in"}{" "}
              <strong className={cn("num font-bold", TRANSACTION_TYPE_META[type].text)}>
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
        <Field label="Staff number (optional)" help="The old sheet's Emp-ID, if they have one.">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="AB-02" />
        </Field>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
