"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  IconCircleCheck,
  IconCircleMinus,
  IconPencil,
  IconTableImport,
  IconTrash,
  IconUserPlus,
  IconUsers,
} from "@tabler/icons-react";

import { parseDoers, DOER_COLUMNS } from "@/lib/checklist/import-parsers";
import { cn } from "@/lib/utils";
import { ImportDialog } from "../import-dialog";
import {
  EmptyState,
  ErrorNote,
  Field,
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
  createDoer,
  deleteDoer,
  importDoers,
  setDoerActive,
  updateDoer,
  type DoerInput,
} from "./actions";

export type DoerRow = {
  id: number;
  name: string;
  email: string;
  department: string | null;
  isAdmin: boolean;
  active: boolean;
  hasLogin: boolean;
  taskCount: number;
};

/**
 * Doers.
 *
 * ── WHAT CHANGED FROM THE ORIGINAL, AND WHY ──────────────────────────────
 *
 * Their "New doer" dialog asks for an INITIAL PASSWORD and creates a Supabase
 * Auth account, because in that system every doer must be able to sign in.
 * This one does not, and the reason is written at length in the schema: most
 * people with a duty on a checklist have no cause to hold a login into a
 * system that holds order values, and forcing one on them would mean creating
 * dozens of passwords nobody would ever use.
 *
 * So there is no password field. A doer is a name, an address and a
 * department. If that address also belongs to an ERP account, the two find
 * each other by email the first time that person signs in — which the table
 * shows as "Signs in", so an administrator can see at a glance who will tick
 * their own work off and who is being ticked off by somebody else.
 *
 * ── DELETE IS NEVER REFUSED ──────────────────────────────────────────────
 *
 * It used to be, while somebody had tasks or history, with Deactivate offered
 * instead. That was useless in practice — a row added by mistake could never
 * be cleared. It is now a soft delete: their tasks stop, outstanding dates go,
 * and their ticks stay. See `deleteDoer` for why those three together are the
 * only reading of "delete it, but keep the old entries".
 *
 * ── THE SEARCH IS LOCAL, DELIBERATELY ────────────────────────────────────
 *
 * The whole list is fetched — thirty-odd rows, a hundred at the outside — and
 * filtered in the browser. A round trip per keystroke would be slower and no
 * more correct at this size.
 */
export function DoersScreen({
  rows,
  departments,
}: {
  rows: DoerRow[];
  departments: string[];
}) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [editing, setEditing] = React.useState<DoerRow | "new" | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<DoerRow | null>(null);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  const existingEmails = React.useMemo(
    () => new Set(rows.map((r) => r.email)),
    [rows],
  );

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.name, r.email, r.department ?? ""].some((f) =>
        f.toLowerCase().includes(needle),
      ),
    );
  }, [rows, q]);

  const activeCount = rows.filter((r) => r.active).length;

  const toggleActive = async (row: DoerRow) => {
    setBusyId(row.id);
    setError(null);
    try {
      await setDoerActive(row.id, !row.active);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That could not be saved.");
    } finally {
      setBusyId(null);
    }
  };

  const doDelete = async (row: DoerRow) => {
    setBusyId(row.id);
    setError(null);
    try {
      const r = await deleteDoer(row.id);
      setConfirmDelete(null);
      setNote(
        r.keptDone > 0
          ? `${row.name} removed. ${r.tasksStopped} task${r.tasksStopped === 1 ? "" : "s"} stopped and ${r.removedOpen} outstanding date${r.removedOpen === 1 ? "" : "s"} cleared; the ${r.keptDone} they had ticked off ${r.keptDone === 1 ? "is" : "are"} kept in the record.`
          : `${row.name} removed, along with ${r.tasksStopped} task${r.tasksStopped === 1 ? "" : "s"} and ${r.removedOpen} scheduled date${r.removedOpen === 1 ? "" : "s"}.`,
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That could not be deleted.");
      setConfirmDelete(null);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        eyebrow="Team"
        title="Doers"
        lede="People duties are assigned to. Deleting somebody stops their tasks and clears what is outstanding, and keeps everything they ticked off."
        action={
          <>
            <QuietButton onClick={() => setImporting(true)}>
              <IconTableImport className="size-3.5" />
              Bulk import
            </QuietButton>
            <PrimaryButton onClick={() => setEditing("new")}>
              <IconUserPlus className="size-4" />
              New doer
            </PrimaryButton>
          </>
        }
      />

      <ErrorNote>{error}</ErrorNote>
      {note && (
        <p className="rounded-field border border-status-green/30 bg-status-green-dim px-3 py-2 text-[12.5px] text-status-green">
          {note}
        </p>
      )}

      {/* Search is the only filter this screen has, so it needs no panel and
          no caption — one toolbar row, with the count where the eye already
          is rather than in a separate strip below the table. */}
      {rows.length > 0 && (
        <Toolbar
          search={
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder="Search by name, email or department…"
            />
          }
        >
          <span className="shrink-0 text-[12px] whitespace-nowrap text-text-3">
            {filtered.length === rows.length
              ? `${rows.length} ${rows.length === 1 ? "person" : "people"}`
              : `${filtered.length} of ${rows.length}`}{" "}
            · {activeCount} active
          </span>
        </Toolbar>
      )}

      {rows.length === 0 ? (
        <TableCard
          empty={
            <EmptyState
              icon={<IconUsers className="size-5" />}
              title="Nobody on the list yet"
              body="Add people one at a time, or paste the whole list straight out of a spreadsheet. Tasks can only be assigned to somebody who is on this list."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <PrimaryButton onClick={() => setEditing("new")}>
                    <IconUserPlus className="size-4" />
                    Add the first doer
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
                  <th className={cn(th, "w-full")}>Name</th>
                  <th className={th}>Department</th>
                  <th className={th}>Email</th>
                  <th className={th}>Signs in</th>
                  <th className={th}>Tasks</th>
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
                    <td className={td}>
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                            r.isAdmin
                              ? "bg-primary text-primary-foreground"
                              : "bg-accent text-accent-text",
                          )}
                        >
                          {initials(r.name)}
                        </span>
                        <span className="font-semibold text-text-1">{r.name}</span>
                        {r.isAdmin && <Pill tone="blue">Admin</Pill>}
                      </div>
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      {r.department || <span className="text-text-3">—</span>}
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>{r.email}</td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      {r.hasLogin ? (
                        <span className="text-status-green">Yes</span>
                      ) : (
                        <span className="text-text-3">No login</span>
                      )}
                    </td>
                    <td className={cn(td, "num text-right whitespace-nowrap")}>
                      {r.taskCount}
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
                        <QuietButton
                          onClick={() => void toggleActive(r)}
                          busy={busyId === r.id}
                        >
                          {r.active ? (
                            <>
                              <IconCircleMinus className="size-3.5" />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <IconCircleCheck className="size-3.5" />
                              Reactivate
                            </>
                          )}
                        </QuietButton>
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
        <DoerDialog
          row={editing === "new" ? null : editing}
          departments={departments}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        title="Bulk import doers"
        columns={DOER_COLUMNS}
        formatHint={
          <>
            Four columns, in this order: <strong>name</strong>,{" "}
            <strong>email</strong>, <strong>department</strong>,{" "}
            <strong>role</strong>. Department and role can be left blank —
            anybody without &ldquo;admin&rdquo; in the role column becomes an
            ordinary doer. A heading row is fine; it will be spotted and
            ignored.
          </>
        }
        sample={
          "Name,Email,Department,Role\n" +
          "Aditya Lohar,aditya@example.com,Analytics,\n" +
          "Seema Patil,seema@example.com,HR,Admin"
        }
        parse={(text) => parseDoers(text, existingEmails)}
        submit={importDoers}
        onDone={() => router.refresh()}
      />

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={`Delete ${confirmDelete?.name ?? ""}?`}
        subtitle="They leave the list and nothing more is scheduled for them."
        footer={
          <>
            <QuietButton onClick={() => setConfirmDelete(null)}>Cancel</QuietButton>
            <button
              type="button"
              onClick={() => confirmDelete && void doDelete(confirmDelete)}
              disabled={busyId !== null}
              className="inline-flex h-9 cursor-pointer items-center justify-center rounded-field bg-status-red px-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-text-2">
          Their tasks stop and every date{" "}
          <strong className="font-semibold text-text-1">not yet ticked
          off</strong> is cleared, so they stop appearing in the delayed
          counts.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-text-2">
          Everything they{" "}
          <strong className="font-semibold text-text-1">did tick off
          stays</strong> — that is a record of work that happened and it keeps
          counting. Adding the same email again brings them, and their record,
          back.
        </p>
      </Modal>
    </div>
  );
}

// ─── the add / edit dialog ────────────────────────────────────────────────

/** The sentinel the Department select uses to mean "let me type a new one". */
const ADD_NEW = "__add_new__";

function DoerDialog({
  row,
  departments,
  onClose,
  onSaved,
}: {
  row: DoerRow | null;
  departments: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(row?.name ?? "");
  const [email, setEmail] = React.useState(row?.email ?? "");
  const [department, setDepartment] = React.useState(row?.department ?? "");
  const [role, setRole] = React.useState(row?.isAdmin ? "admin" : "user");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * A dropdown with a way out.
   *
   * Somebody editing a person whose department is no longer on the list — one
   * deactivated in Masters, or a spelling nobody else uses — must not have it
   * silently changed to something else just by opening the dialog. So the
   * field starts in TYPING mode whenever the current value is not an option,
   * and the value is preserved rather than snapped to the nearest match.
   */
  const [typing, setTyping] = React.useState(
    () => !!row?.department && !departments.includes(row.department),
  );

  const save = async () => {
    setBusy(true);
    setError(null);
    const input: DoerInput = {
      name,
      email,
      department: department || null,
      isAdmin: role === "admin",
    };
    try {
      if (row) await updateDoer(row.id, input);
      else await createDoer(input);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That could not be saved.");
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={row ? `Edit ${row.name}` : "New doer"}
      footer={
        <>
          <QuietButton onClick={onClose} disabled={busy}>
            Cancel
          </QuietButton>
          <PrimaryButton onClick={save} busy={busy} disabled={!name.trim() || !email.trim()}>
            Save
          </PrimaryButton>
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

        <Field
          label="Email"
          hint="Also how they are matched to an ERP login, if they have one. They do not need one."
        >
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </Field>

        <Field
          label="Department"
          hint={
            typing
              ? "It will appear in this list for everybody else once saved."
              : "From your company list in Masters, plus any already used on the checklist."
          }
        >
          {typing ? (
            <div className="flex gap-2">
              <Input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Housekeeping, Fusing, DEO…"
                autoFocus
              />
              {departments.length > 0 && (
                <QuietButton
                  className="h-9 shrink-0"
                  onClick={() => {
                    setTyping(false);
                    setDepartment("");
                  }}
                >
                  Use the list
                </QuietButton>
              )}
            </div>
          ) : (
            <Select
              value={department}
              onChange={(e) => {
                if (e.target.value === ADD_NEW) {
                  setTyping(true);
                  setDepartment("");
                } else {
                  setDepartment(e.target.value);
                }
              }}
            >
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
              <option value={ADD_NEW}>+ Add a new department…</option>
            </Select>
          )}
        </Field>

        <Field
          label="Role"
          hint="An administrator can create tasks, tick anybody's work off and see every scorecard. Everybody else sees only their own."
        >
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="user">Doer — sees only their own work</option>
            <option value="admin">Administrator — runs the checklist</option>
          </Select>
        </Field>

        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
