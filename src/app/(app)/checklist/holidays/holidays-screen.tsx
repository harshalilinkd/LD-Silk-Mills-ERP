"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  IconCalendarPlus,
  IconInfoCircle,
  IconPencil,
  IconTableImport,
  IconTrash,
} from "@tabler/icons-react";

import {
  formatDate,
  todayIso,
  weekdayName,
  weekdayOf,
} from "@/lib/checklist/dates";
import { HOLIDAY_COLUMNS, parseHolidays } from "@/lib/checklist/import-parsers";
import { cn } from "@/lib/utils";
import { ImportDialog } from "../import-dialog";
import {
  DialogCancel,
  DialogSave,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Modal,
  PageHead,
  Pill,
  PrimaryButton,
  QuietButton,
  TableCard,
  td,
  th,
} from "../parts";
import {
  createHoliday,
  deleteHoliday,
  importHolidays,
  updateHoliday,
} from "./actions";

export type HolidayRow = { id: number; date: string; name: string | null };

/**
 * Holidays.
 *
 * ── THE SCREEN SAYS WHAT ADDING ONE WILL DO ──────────────────────────────
 *
 * Their version is a plain list: add a date, and scheduled work on it quietly
 * disappears. That is the correct behaviour, but finding out about it
 * afterwards — from a checklist that is suddenly shorter — is not how somebody
 * should learn it. So the dialog says it before, and the confirmation says
 * what actually happened: how many rows were cleared, and how many were
 * already ticked and therefore left exactly where they were.
 *
 * A Sunday can be listed and does nothing, because Sundays are already
 * excluded by rule. Rather than refuse a festival that happens to fall on one,
 * the row is marked so nobody sits waiting for an effect that will not come.
 */
export function HolidaysScreen({
  rows,
  window: fy,
}: {
  rows: HolidayRow[];
  window: { from: string; to: string; label: string };
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<HolidayRow | "new" | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  const existingDates = React.useMemo(
    () => new Set(rows.map((r) => r.date)),
    [rows],
  );

  const today = todayIso();

  const remove = async (row: HolidayRow) => {
    setBusyId(row.id);
    setError(null);
    setNote(null);
    try {
      const { restored } = await deleteHoliday(row.id);
      setNote(
        restored > 0
          ? `${formatDate(row.date)} is a working day again — ${restored} task${restored === 1 ? " is" : "s are"} now due.`
          : `${formatDate(row.date)} removed from the holiday list.`,
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That could not be removed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        eyebrow="Calendar"
        title="Holidays"
        lede="Dates no work is scheduled on. Sundays are always excluded already — list the extra days here."
        action={
          <>
            <QuietButton onClick={() => setImporting(true)}>
              <IconTableImport className="size-3.5" />
              Bulk import
            </QuietButton>
            <PrimaryButton onClick={() => setEditing("new")}>
              <IconCalendarPlus className="size-4" />
              New holiday
            </PrimaryButton>
          </>
        }
      />

      <div className="flex items-start gap-2 rounded-field border border-border bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed text-text-3">
        <IconInfoCircle className="mt-0.5 size-4 shrink-0" />
        <p>
          Work is scheduled for the financial year{" "}
          <strong className="font-semibold text-text-2">{fy.label}</strong> (
          {formatDate(fy.from)} to {formatDate(fy.to)}). Adding a holiday clears
          anything scheduled that day from today onwards; anything already
          ticked off stays exactly as it is.
        </p>
      </div>

      <ErrorNote>{error}</ErrorNote>
      {note && (
        <p className="rounded-field border border-status-green/30 bg-status-green-dim px-3 py-2 text-[12.5px] text-status-green">
          {note}
        </p>
      )}

      {rows.length === 0 ? (
        <TableCard
          empty={
            <EmptyState
              icon={<IconCalendarPlus className="size-5" />}
              title="No holidays listed"
              body="Sundays are already excluded from every schedule. Add the festivals and shutdown days on top of that — one at a time, or paste the year's list in one go."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <PrimaryButton onClick={() => setEditing("new")}>
                    <IconCalendarPlus className="size-4" />
                    Add a holiday
                  </PrimaryButton>
                  <QuietButton onClick={() => setImporting(true)}>
                    <IconTableImport className="size-3.5" />
                    Bulk import
                  </QuietButton>
                </div>
              }
            />
          }
        />
      ) : (
        <>
          <TableCard>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Weekday</th>
                  <th className={cn(th, "w-full")}>Name</th>
                  <th className={cn(th, "text-right")}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const sunday = weekdayOf(r.date) === 0;
                  const past = r.date < today;
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        "transition-colors hover:bg-surface-2",
                        past && "opacity-55",
                      )}
                    >
                      <td className={cn(td, "num font-semibold whitespace-nowrap text-text-1")}>
                        {formatDate(r.date)}
                      </td>
                      <td className={cn(td, "whitespace-nowrap")}>
                        {weekdayName(r.date)}
                      </td>
                      <td className={td}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{r.name || <span className="text-text-3">—</span>}</span>
                          {sunday && (
                            <Pill tone="grey">Sunday — already a day off</Pill>
                          )}
                          {past && !sunday && <Pill tone="grey">Passed</Pill>}
                        </div>
                      </td>
                      <td className={cn(td, "whitespace-nowrap")}>
                        <div className="flex items-center justify-end gap-1.5">
                          <QuietButton onClick={() => setEditing(r)}>
                            <IconPencil className="size-3.5" />
                            Edit
                          </QuietButton>
                          <QuietButton
                            tone="danger"
                            aria-label={`Remove ${formatDate(r.date)}`}
                            busy={busyId === r.id}
                            onClick={() => void remove(r)}
                          >
                            <IconTrash className="size-3.5" />
                          </QuietButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableCard>
          <p className="text-[12px] text-text-3">
            {rows.length} holiday{rows.length === 1 ? "" : "s"} listed
          </p>
        </>
      )}

      {editing && (
        <HolidayDialog
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            setNote(msg);
            router.refresh();
          }}
        />
      )}

      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        title="Bulk import holidays"
        columns={HOLIDAY_COLUMNS}
        formatHint={
          <>
            Two columns: <strong>date</strong> and <strong>name</strong>. Dates
            written <strong>26/01/2026</strong> are read day-first, the way they
            are written here; <strong>2026-01-26</strong> also works. A heading
            row is fine.
          </>
        }
        sample={
          "Date,Name\n" +
          "26/01/2026,Republic Day\n" +
          "19/03/2026,Gudi Padwa\n" +
          "2026-08-15,Independence Day"
        }
        parse={(text) => parseHolidays(text, existingDates)}
        submit={importHolidays}
        onDone={() => router.refresh()}
      />
    </div>
  );
}

// ─── the add / edit dialog ────────────────────────────────────────────────

function HolidayDialog({
  row,
  onClose,
  onSaved,
}: {
  row: HolidayRow | null;
  onClose: () => void;
  onSaved: (note: string | null) => void;
}) {
  const [date, setDate] = React.useState(row?.date ?? "");
  const [name, setName] = React.useState(row?.name ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const sunday = date.length === 10 && weekdayOf(date) === 0;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (row) {
        await updateHoliday(row.id, date, name || null);
        onSaved(`${formatDate(date)} saved.`);
      } else {
        const { cleared, keptDone } = await createHoliday(date, name || null);
        const bits: string[] = [`${formatDate(date)} is now a holiday.`];
        if (cleared > 0) {
          bits.push(`${cleared} scheduled task${cleared === 1 ? "" : "s"} cleared.`);
        }
        if (keptDone > 0) {
          bits.push(
            `${keptDone} already ticked off ${keptDone === 1 ? "was" : "were"} left alone.`,
          );
        }
        onSaved(bits.join(" "));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That could not be saved.");
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={row ? "Edit holiday" : "New holiday"}
      footer={
        <>
          <DialogCancel onClick={onClose} disabled={busy} />
          <DialogSave onClick={save} busy={busy} disabled={date.length !== 10} />
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field
          label="Date"
          hint={
            date.length === 10 ? (
              <>
                {weekdayName(date)}
                {sunday && " — already a day off, so this will not change any schedule"}
              </>
            ) : undefined
          }
        >
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            autoFocus
          />
        </Field>

        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Diwali, Republic Day, factory shutdown…"
          />
        </Field>

        {!row && !sunday && (
          <p className="rounded-field border border-status-amber/30 bg-status-amber-dim px-3 py-2 text-[12.5px] leading-relaxed text-status-amber">
            Anything scheduled on this date from today onwards will be cleared.
            Work already ticked off is never touched.
          </p>
        )}

        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
