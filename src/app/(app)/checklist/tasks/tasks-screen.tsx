"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  IconChecklist,
  IconInfoCircle,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTableImport,
  IconTrash,
  IconUsersGroup,
} from "@tabler/icons-react";

import { formatDate } from "@/lib/checklist/dates";
import {
  FREQUENCY_META,
  FREQUENCIES,
  frequencyLabelFor,
  type Frequency,
} from "@/lib/checklist/frequency";
import { parseTasks, TASK_COLUMNS } from "@/lib/checklist/import-parsers";
import { cn } from "@/lib/utils";
import { ImportDialog } from "../import-dialog";
import {
  EmptyState,
  DialogCancel,
  DialogSave,
  ErrorNote,
  Field,
  FilterField,
  FilterPanel,
  FiltersButton,
  Input,
  Modal,
  PageHead,
  Pill,
  PrimaryButton,
  QuietButton,
  SearchBox,
  Select,
  TableCard,
  Toolbar,
  td,
  th,
} from "../parts";
import {
  createTask,
  createTaskForAll,
  deleteTask,
  importTasks,
  rebuildSchedule,
  updateTask,
  type TaskInput,
} from "./actions";

export type TaskRow = {
  id: number;
  name: string;
  doerId: number;
  doerName: string;
  doerEmail: string;
  department: string | null;
  frequency: Frequency;
  startDate: string;
  endDate: string | null;
  assignedBy: string | null;
  notes: string | null;
  active: boolean;
};

export type Person = {
  id: number;
  name: string;
  email: string;
  department: string | null;
  active: boolean;
};

/**
 * Tasks — the standing duties.
 *
 * ── EDITING ONE RE-ISSUES ITS SCHEDULE, AND SAYS SO ──────────────────────
 *
 * Changing a task's frequency or dates changes hundreds of dated rows behind
 * it. Their screen does this silently; this one reports what happened —
 * "34 dates added, 12 removed" — because a change that big should not be
 * invisible, and because seeing "0 removed" is how somebody satisfies
 * themselves that their edit did not eat any completed work.
 *
 * ── SIX FILTERS, IN THE BROWSER ──────────────────────────────────────────
 *
 * All of them narrow the same fetched list. See the note on the page
 * component for where that stops being the right trade.
 */
export function TasksScreen({
  rows,
  people,
  assigners,
  scheduledRows,
  window: fy,
  today,
}: {
  rows: TaskRow[];
  people: Person[];
  /** Names that have assigned work before, plus every active doer. */
  assigners: string[];
  scheduledRows: number;
  window: { from: string; to: string; label: string };
  /** Resolved on the server, so the browser's clock cannot disagree. */
  today: string;
}) {
  const router = useRouter();

  const [doerId, setDoerId] = React.useState("");
  const [department, setDepartment] = React.useState("");
  const [q, setQ] = React.useState("");
  const [freq, setFreq] = React.useState("");
  const [status, setStatus] = React.useState("");

  const [showFilters, setShowFilters] = React.useState(false);
  const [editing, setEditing] = React.useState<TaskRow | "new" | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<TaskRow | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  const departments = React.useMemo(
    () =>
      [...new Set(people.map((p) => p.department).filter((d): d is string => !!d))].sort(),
    [people],
  );

  const activeCount =
    (doerId ? 1 : 0) + (department ? 1 : 0) + (q.trim() ? 1 : 0) + (freq ? 1 : 0) + (status ? 1 : 0);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (doerId && String(r.doerId) !== doerId) return false;
      if (department && r.department !== department) return false;
      if (freq && r.frequency !== freq) return false;
      if (status === "active" && !r.active) return false;
      if (status === "inactive" && r.active) return false;
      if (needle && !r.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, doerId, department, freq, status, q]);

  const clear = () => {
    setDoerId("");
    setDepartment("");
    setQ("");
    setFreq("");
    setStatus("");
  };

  const doDelete = async (row: TaskRow) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const r = await deleteTask(row.id);
      setConfirmDelete(null);
      setNote(
        r.keptDone > 0
          ? `"${row.name}" removed. ${r.removedOpen} scheduled date${r.removedOpen === 1 ? "" : "s"} cleared; the ${r.keptDone} already ticked off ${r.keptDone === 1 ? "is" : "are"} kept in the record.`
          : `"${row.name}" removed, along with ${r.removedOpen} scheduled date${r.removedOpen === 1 ? "" : "s"}.`,
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That could not be deleted.");
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  };

  const doRebuild = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const r = await rebuildSchedule();
      setNote(
        r.added > 0
          ? `${r.added} missing date${r.added === 1 ? "" : "s"} filled in across ${r.tasks} active task${r.tasks === 1 ? "" : "s"} for ${r.window}.`
          : `Everything is already scheduled for ${r.window} — nothing needed adding.`,
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The schedule could not be rebuilt.");
    } finally {
      setBusy(false);
    }
  };

  const noDoers = people.filter((p) => p.active).length === 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        eyebrow="Catalogue"
        title="Tasks"
        lede="Standing duties and who they belong to. Editing one re-issues the dates still to come; deleting one keeps whatever was ticked off."
        action={
          <>
            <QuietButton onClick={() => setImporting(true)} disabled={noDoers}>
              <IconTableImport className="size-3.5" />
              Bulk import
            </QuietButton>
            <PrimaryButton onClick={() => setEditing("new")} disabled={noDoers}>
              <IconPlus className="size-4" />
              New task
            </PrimaryButton>
          </>
        }
      />

      {noDoers && (
        <div className="flex items-start gap-2 rounded-field border border-status-amber/30 bg-status-amber-dim px-3 py-2 text-[12.5px] leading-relaxed text-status-amber">
          <IconInfoCircle className="mt-0.5 size-4 shrink-0" />
          <p>
            Add somebody to the <strong>Doers</strong> list first. A task has to
            belong to a person, so there is nobody to give one to yet.
          </p>
        </div>
      )}

      <ErrorNote>{error}</ErrorNote>
      {note && (
        <p className="rounded-field border border-status-green/30 bg-status-green-dim px-3 py-2 text-[12.5px] text-status-green">
          {note}
        </p>
      )}

      {/* ONE row: search, the count of dated rows, Filters, Rebuild. The
          count used to be a full-width strip of its own above the filter card
          — two bands of furniture before any data. It is a fact about the
          schedule and it belongs beside the button that rebuilds it. */}
      {!noDoers && (
        <Toolbar
          search={
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder="Search task name…"
            />
          }
        >
          <span
            className="hidden shrink-0 text-[12px] whitespace-nowrap text-text-3 lg:inline"
            title={`Financial year ${fy.label}: ${formatDate(fy.from)} to ${formatDate(fy.to)}. The next year fills itself in on 1 April — Rebuild is only needed if you have edited holidays directly.`}
          >
            <strong className="num font-semibold text-text-2">
              {scheduledRows.toLocaleString("en-IN")}
            </strong>{" "}
            dates scheduled for {fy.label}
          </span>
          <FiltersButton
            open={showFilters}
            active={activeCount > 0}
            onClick={() => setShowFilters((v) => !v)}
          />
          <QuietButton
            onClick={doRebuild}
            busy={busy}
            className="h-9 shrink-0"
            title="Fills in any missing dates. The new financial year does this on its own every 1 April — this is here for the rare case where holidays were changed outside the app."
          >
            <IconRefresh className="size-3.5" />
            Rebuild
          </QuietButton>
        </Toolbar>
      )}

      {showFilters && !noDoers && (
        <FilterPanel active={activeCount > 0} onClear={clear}>
          <FilterField label="Doer">
            <Select value={doerId} onChange={(e) => setDoerId(e.target.value)}>
              <option value="">All doers</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.active ? "" : " (inactive)"}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Department">
            <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Frequency">
            <Select value={freq} onChange={(e) => setFreq(e.target.value)}>
              <option value="">All frequencies</option>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f} · {FREQUENCY_META[f].label}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Active and inactive</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </Select>
          </FilterField>
        </FilterPanel>
      )}

      {rows.length === 0 ? (
        <TableCard
          empty={
            <EmptyState
              icon={<IconChecklist className="size-5" />}
              title="No tasks yet"
              body={
                noDoers
                  ? "Tasks are assigned to people, so add the doers list first."
                  : "A task is a standing duty — what has to be done, by whom, and how often. Add one, or paste the whole list from a spreadsheet."
              }
              action={
                !noDoers && (
                  <div className="flex flex-wrap justify-center gap-2">
                    <PrimaryButton onClick={() => setEditing("new")}>
                      <IconPlus className="size-4" />
                      Add the first task
                    </PrimaryButton>
                    <QuietButton onClick={() => setImporting(true)}>
                      <IconTableImport className="size-3.5" />
                      Bulk import
                    </QuietButton>
                  </div>
                )
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
                  <th className={cn(th, "w-full")}>Task name</th>
                  <th className={th}>Doer</th>
                  <th className={th}>Freq</th>
                  <th className={th}>From</th>
                  <th className={th}>To</th>
                  <th className={th}>Status</th>
                  <th className={cn(th, "text-right")}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className={cn(
                      "transition-colors hover:bg-surface-2",
                      !r.active && "opacity-55",
                    )}
                  >
                    <td className={cn(td, "font-medium text-text-1")}>{r.name}</td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      <div className="flex flex-col">
                        <span className="text-text-1">{r.doerName}</span>
                        {r.department && (
                          <span className="text-[11.5px] text-text-3">{r.department}</span>
                        )}
                      </div>
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      <span title={frequencyLabelFor(r.frequency, r.startDate)}>
                        {r.frequency}
                      </span>
                    </td>
                    <td className={cn(td, "num whitespace-nowrap")}>
                      {formatDate(r.startDate)}
                    </td>
                    <td className={cn(td, "num whitespace-nowrap")}>
                      {r.endDate ? formatDate(r.endDate) : formatDate(fy.to)}
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      {r.active ? (
                        <Pill tone="green">Active</Pill>
                      ) : (
                        <Pill tone="grey">Inactive</Pill>
                      )}
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      <div className="flex items-center justify-end gap-1.5">
                        <QuietButton onClick={() => setEditing(r)}>
                          <IconPencil className="size-3.5" />
                          Edit
                        </QuietButton>
                        <QuietButton
                          tone="danger"
                          aria-label={`Delete ${r.name}`}
                          onClick={() => setConfirmDelete(r)}
                        >
                          <IconTrash className="size-3.5" />
                        </QuietButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </>
      )}

      {editing && (
        <TaskDialog
          row={editing === "new" ? null : editing}
          people={people}
          assigners={assigners}
          window={fy}
          today={today}
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
        title="Bulk import tasks"
        columns={TASK_COLUMNS}
        formatHint={
          <>
            Six columns: <strong>task</strong>, <strong>doer&rsquo;s email</strong>,{" "}
            <strong>frequency</strong>, <strong>start</strong>,{" "}
            <strong>end</strong>, <strong>assigned by</strong>. The last three
            can be blank — a blank start means the beginning of the financial
            year. The doer must already be on the Doers list; a task for
            somebody who is not will be refused rather than creating them.
            Frequency codes: {FREQUENCIES.join(", ")}.
          </>
        }
        sample={
          "Task,Doer email,Freq,Start,End,Assigned by\n" +
          "Check the dyeing register,aditya@example.com,D,,,Harshali\n" +
          "Review stock report,seema@example.com,W,01/04/2026,,"
        }
        parse={(text) =>
          parseTasks(
            text,
            new Set(people.filter((p) => p.active).map((p) => p.email)),
            new Set(rows.map((r) => `${r.name.toLowerCase()}|${r.doerEmail}`)),
            fy.from,
          )
        }
        submit={importTasks}
        onDone={() => router.refresh()}
      />

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete this task?"
        subtitle={confirmDelete?.name}
        footer={
          <>
            <DialogCancel onClick={() => setConfirmDelete(null)} />
            <DialogSave
              destructive
              busy={busy}
              onClick={() => confirmDelete && void doDelete(confirmDelete)}
            >
              Delete
            </DialogSave>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-text-2">
          The task goes from this list and nothing more is ever scheduled for
          it. Every date <strong className="font-semibold text-text-1">not
          yet ticked off</strong> is cleared.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-text-2">
          Anything <strong className="font-semibold text-text-1">already
          ticked off stays</strong> — it is a record of work that actually
          happened, and it keeps counting on the scorecards. If you only want
          to pause the task, Edit it and set the status to Inactive instead.
        </p>
      </Modal>
    </div>
  );
}

// ─── the add / edit dialog ────────────────────────────────────────────────

/** The sentinel "Assigned by" uses to mean "let me type a name". */
const ADD_NEW_ASSIGNER = "__add_new__";

function TaskDialog({
  row,
  people,
  assigners,
  window: fy,
  today,
  onClose,
  onSaved,
}: {
  row: TaskRow | null;
  people: Person[];
  assigners: string[];
  window: { from: string; to: string; label: string };
  today: string;
  onClose: () => void;
  onSaved: (note: string) => void;
}) {
  const activePeople = people.filter((p) => p.active);

  const [name, setName] = React.useState(row?.name ?? "");
  const [all, setAll] = React.useState(false);
  const [doerId, setDoerId] = React.useState(row ? String(row.doerId) : "");
  const [frequency, setFrequency] = React.useState<Frequency>(row?.frequency ?? "D");
  // TODAY, not the start of the financial year.
  //
  // A new task is almost always something starting now. Defaulting to 1 April
  // meant every task created in September silently generated five months of
  // dates that were already delayed the moment they appeared — the person
  // would open their checklist to a hundred overdue rows for a duty they had
  // just been given. The field is still editable for the rare backdated one.
  const [startDate, setStartDate] = React.useState(
    row?.startDate ?? (today > fy.from && today <= fy.to ? today : fy.from),
  );
  const [endDate, setEndDate] = React.useState(row?.endDate ?? "");
  const [assignedBy, setAssignedBy] = React.useState(row?.assignedBy ?? "");
  // Same rule as the department field: a value that is not on the list opens
  // in the text box with itself intact, rather than being silently snapped to
  // whichever option happened to be first.
  const [typingAssigner, setTypingAssigner] = React.useState(
    () => !!row?.assignedBy && !assigners.includes(row.assignedBy),
  );
  const [notes, setNotes] = React.useState(row?.notes ?? "");
  const [active, setActive] = React.useState(row?.active ?? true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const meta = FREQUENCY_META[frequency];

  const save = async () => {
    setBusy(true);
    setError(null);
    const base = {
      name,
      frequency,
      startDate,
      endDate: endDate || null,
      assignedBy: assignedBy || null,
      notes: notes || null,
      active,
    };
    try {
      if (row) {
        const r = await updateTask(row.id, { ...base, doerId: Number(doerId) });
        onSaved(
          `"${name.trim()}" saved — ${r.added} date${r.added === 1 ? "" : "s"} added, ${r.removed} removed. Nothing already ticked off was touched.`,
        );
      } else if (all) {
        const r = await createTaskForAll(base as Omit<TaskInput, "doerId">);
        onSaved(
          `"${name.trim()}" given to ${r.created} ${r.created === 1 ? "person" : "people"} — ${r.scheduled} dates scheduled.`,
        );
      } else {
        const r = await createTask({ ...base, doerId: Number(doerId) });
        onSaved(
          `"${name.trim()}" added — ${r.scheduled} date${r.scheduled === 1 ? "" : "s"} scheduled for ${fy.label}.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That could not be saved.");
      setBusy(false);
    }
  };

  const ready = name.trim().length > 0 && startDate.length === 10 && (all || !!doerId);

  return (
    <Modal
      open
      onClose={onClose}
      title={row ? "Edit task" : "New task"}
      subtitle={
        row
          ? "Changing the frequency or the dates re-issues everything still to come. Anything already ticked off is left alone."
          : undefined
      }
      footer={
        <>
          <DialogCancel onClick={onClose} disabled={busy} />
          <DialogSave onClick={save} busy={busy} disabled={!ready} />
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Task name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="Check the dyeing register"
          />
        </Field>

        {!row && (
          <label
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-field border px-3 py-2.5 transition-colors",
              all
                ? "border-primary/40 bg-accent"
                : "border-border bg-surface-2 hover:border-border-strong",
            )}
          >
            <input
              type="checkbox"
              checked={all}
              onChange={(e) => setAll(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-text-1">
                Give it to everybody
              </span>
              <span className="block text-[12px] leading-snug text-text-3">
                Creates {activePeople.length} separate task
                {activePeople.length === 1 ? "" : "s"} — one for each active
                doer, each with its own schedule.
              </span>
            </span>
          </label>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Doer">
            <Select
              value={doerId}
              onChange={(e) => setDoerId(e.target.value)}
              disabled={all}
            >
              <option value="">Choose a person…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.department ? ` · ${p.department}` : ""}
                  {p.active ? "" : " (inactive)"}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="How often" help={meta.help}>
            <Select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_META[f].label} ({f})
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Starts"
            help={
              meta.weekdayFromStart && startDate.length === 10
                ? frequencyLabelFor(frequency, startDate)
                : "Defaults to today. It is also the anchor — a monthly task takes its day of the month from here."
            }
          >
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>

          <Field label="Ends (optional)" help={`Blank runs to ${formatDate(fy.to)}.`}>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Assigned by"
            help={
              typingAssigner
                ? "It will be on the list next time."
                : "Who asked for this duty."
            }
          >
            {typingAssigner ? (
              <div className="flex gap-2">
                <Input
                  value={assignedBy}
                  onChange={(e) => setAssignedBy(e.target.value)}
                  placeholder="Who asked for it"
                  autoFocus
                />
                {assigners.length > 0 && (
                  <QuietButton
                    className="h-9 shrink-0"
                    onClick={() => {
                      setTypingAssigner(false);
                      setAssignedBy("");
                    }}
                  >
                    List
                  </QuietButton>
                )}
              </div>
            ) : (
              <Select
                value={assignedBy}
                onChange={(e) => {
                  if (e.target.value === ADD_NEW_ASSIGNER) {
                    setTypingAssigner(true);
                    setAssignedBy("");
                  } else {
                    setAssignedBy(e.target.value);
                  }
                }}
              >
                <option value="">Not recorded</option>
                {assigners.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
                <option value={ADD_NEW_ASSIGNER}>+ Someone else…</option>
              </Select>
            )}
          </Field>

          <Field
            label="Status"
            help={active ? undefined : "No new dates will be scheduled."}
          >
            <Select
              value={active ? "active" : "inactive"}
              onChange={(e) => setActive(e.target.value === "active")}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>

        <Field label="Notes (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything the person doing it needs to know"
            className="w-full resize-y rounded-field border border-border bg-surface px-2.5 py-2 text-[13px] text-text-1 outline-none placeholder:text-text-placeholder focus:border-primary/50 focus:ring-3 focus:ring-primary/15"
          />
        </Field>

        {all && activePeople.length > 6 && (
          <p className="flex items-start gap-2 rounded-field border border-status-amber/30 bg-status-amber-dim px-3 py-2 text-[12.5px] leading-relaxed text-status-amber">
            <IconUsersGroup className="mt-0.5 size-4 shrink-0" />
            <span>
              This will create {activePeople.length} tasks and their whole
              year&rsquo;s dates in one go. It can take up to a minute — leave
              the page open until it finishes.
            </span>
          </p>
        )}

        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
