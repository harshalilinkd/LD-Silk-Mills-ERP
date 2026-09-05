"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  IconCategory,
  IconPlus,
  IconShieldLock,
  IconUsers,
} from "@tabler/icons-react";

import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/petty-cash/money";
import type {
  CategoryRow,
  PayeeRow,
  PettyCashPerson,
} from "@/lib/petty-cash/queries";
import type { MemberRole } from "@/db/petty-cash/schema";
import { cn } from "@/lib/utils";
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
  SearchBox,
  Select,
  TableCard,
  Tabs,
  Toolbar,
  td,
  th,
} from "@/components/ui/module-parts";
import { usePettyCashViewer } from "../viewer-context";
import {
  addCategory,
  addEmployee,
  clearPersonRole,
  editCategory,
  renamePayee,
  setCategoryEnabled,
  setEmployeeEnabled,
  setPersonRole,
} from "../actions";

type Tab = "payees" | "categories" | "people";

const ROLE_META: Record<MemberRole, { label: string; help: string }> = {
  VIEWER: {
    label: "Can only look",
    help: "Sees the ledger, the balance and the reports. Records nothing.",
  },
  OPERATOR: {
    label: "Can record and correct",
    help: "Adds entries and fixes their own mistakes. Cannot delete.",
  },
  ADMIN: {
    label: "Runs Petty Cash",
    help: "Everything, including deleting an entry and this screen.",
  },
};

const ROLE_ORDER: MemberRole[] = ["VIEWER", "OPERATOR", "ADMIN"];

/**
 * The two lists the entry form offers, and who may use it.
 *
 * ── NOTHING HERE IS EVER DELETED ─────────────────────────────────────────
 *
 * A payee or a category is switched OFF, which stops it appearing on the form
 * and changes not one entry already filed under it. Every screen in this
 * module says the same thing, because the alternative — deleting a category
 * with 200 payments behind it — either destroys the record or leaves rows
 * pointing at nothing, and both are worse than a longer list.
 *
 * The counts beside each name are what make that decision possible: a name
 * used 340 times is the canteen and a name used once is a typo.
 */
export function MastersScreen({
  payees,
  categories,
  groups,
  people,
}: {
  payees: PayeeRow[];
  categories: CategoryRow[];
  groups: string[];
  people: PettyCashPerson[];
}) {
  const [tab, setTab] = React.useState<Tab>("payees");

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        eyebrow="Petty Cash"
        title="Lists and access"
        lede="The names and categories the entry form offers, and who may use it."
      />

      <Tabs
        ariaLabel="Which list"
        value={tab}
        onChange={setTab}
        options={[
          { value: "payees", label: "Payees", icon: <IconUsers className="size-4" /> },
          { value: "categories", label: "Categories", icon: <IconCategory className="size-4" /> },
          { value: "people", label: "Who may use it", icon: <IconShieldLock className="size-4" /> },
        ]}
      />

      {tab === "payees" && <Payees rows={payees} />}
      {tab === "categories" && <Categories rows={categories} groups={groups} />}
      {tab === "people" && <People rows={people} />}
    </div>
  );
}

// ─── payees ───────────────────────────────────────────────────────────────

function Payees({ rows }: { rows: PayeeRow[] }) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [showOff, setShowOff] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<PayeeRow | null>(null);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (showOff || r.active) &&
      (!q || r.name.toLowerCase().includes(q) || (r.code ?? "").toLowerCase().includes(q)),
  );
  const off = rows.filter((r) => !r.active).length;

  const toggle = async (row: PayeeRow) => {
    setBusyId(row.id);
    setError(null);
    try {
      await setEmployeeEnabled(row.id, !row.active);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That could not be changed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Toolbar
        search={
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search a name or a code…"
          />
        }
      >
        <QuietButton className="h-9" onClick={() => setShowOff((v) => !v)}>
          {showOff ? "Hide switched off" : `Show switched off${off ? ` (${off})` : ""}`}
        </QuietButton>
        <PrimaryButton onClick={() => setAdding(true)}>
          <IconPlus className="size-3.5" />
          Add a payee
        </PrimaryButton>
      </Toolbar>

      <ErrorNote>{error}</ErrorNote>

      {shown.length === 0 ? (
        <TableCard
          empty={
            <EmptyState
              icon={<IconUsers className="size-5" />}
              title={q ? "Nobody matches that" : "No payees yet"}
              body={
                q
                  ? "Try part of the name, or clear the search."
                  : "Add the people and shops the cash actually goes to. They need no ERP login."
              }
            />
          }
        />
      ) : (
        <TableCard>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={cn(th, "w-full")}>Name</th>
                <th className={th}>Code</th>
                <th className={cn(th, "text-right")}>Entries</th>
                <th className={cn(th, "text-right")}>Paid out</th>
                <th className={th}>Last used</th>
                <th className={th}>Status</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-surface-2">
                  <td className={cn(td, "font-medium text-text-1")}>{r.name}</td>
                  <td className={cn(td, "num whitespace-nowrap text-text-3")}>
                    {r.code ?? "—"}
                  </td>
                  <td className={cn(td, "num text-right")}>{r.used || "—"}</td>
                  <td className={cn(td, "num text-right font-semibold text-text-1")}>
                    {r.used ? formatMoney(r.paid) : "—"}
                  </td>
                  <td className={cn(td, "num whitespace-nowrap text-text-3")}>
                    {r.lastUsed ? formatDate(r.lastUsed) : "—"}
                  </td>
                  <td className={td}>
                    <Pill tone={r.active ? "green" : "grey"}>
                      {r.active ? "On the form" : "Switched off"}
                    </Pill>
                  </td>
                  <td className={cn(td, "text-right whitespace-nowrap")}>
                    <div className="flex justify-end gap-1.5">
                      <QuietButton onClick={() => setEditing(r)}>Rename</QuietButton>
                      <QuietButton
                        tone={r.active ? "danger" : "neutral"}
                        busy={busyId === r.id}
                        onClick={() => toggle(r)}
                      >
                        {r.active ? "Switch off" : "Switch on"}
                      </QuietButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      <p className="text-[11.5px] text-text-3">
        Switching somebody off takes them off the entry form and leaves every
        entry already recorded against them exactly as it is.
      </p>

      {adding && <PayeeDialog onClose={() => setAdding(false)} />}
      {editing && <PayeeDialog row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PayeeDialog({ row, onClose }: { row?: PayeeRow; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = React.useState(row?.name ?? "");
  const [code, setCode] = React.useState(row?.code ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (row) await renamePayee(row.id, name, code || null);
      else await addEmployee(name, code || null);
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That could not be saved.");
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={row ? "Rename this payee" : "Add a payee"}
      subtitle={
        row
          ? "Entries already recorded keep the name they were saved with."
          : "Somebody or somewhere the cash goes. No ERP login needed."
      }
      footer={
        <>
          <DialogCancel onClick={onClose} disabled={busy} />
          <DialogSave onClick={save} busy={busy} disabled={!name.trim()}>
            {row ? "Save" : "Add"}
          </DialogSave>
        </>
      }
    >
      <Field label="Name">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ramesh Patil"
        />
      </Field>

      <Field
        label="Code (optional)"
        hint="A staff or shop number, if the office uses one."
      >
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="EMP-104"
        />
      </Field>

      {row && row.used > 0 && (
        <p className="rounded-field border border-border bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-text-3">
          This name is on{" "}
          <strong className="num font-semibold text-text-2">{row.used}</strong>{" "}
          {row.used === 1 ? "entry" : "entries"} worth{" "}
          <strong className="num font-semibold text-text-2">
            {formatMoney(row.paid)}
          </strong>
          . Those keep the old spelling — a renamed payee does not rewrite the
          past.
        </p>
      )}

      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}

// ─── categories ───────────────────────────────────────────────────────────

function Categories({ rows, groups }: { rows: CategoryRow[]; groups: string[] }) {
  const router = useRouter();
  const [showOff, setShowOff] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<CategoryRow | null>(null);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const shown = rows.filter((r) => showOff || r.active);
  const off = rows.filter((r) => !r.active).length;

  // Grouped, because the group is what the monthly summary reports on and
  // seeing the list any other way hides the shape of the reporting.
  const byGroup = new Map<string, CategoryRow[]>();
  for (const r of shown) {
    const list = byGroup.get(r.groupName) ?? [];
    list.push(r);
    byGroup.set(r.groupName, list);
  }

  const toggle = async (row: CategoryRow) => {
    setBusyId(row.id);
    setError(null);
    try {
      await setCategoryEnabled(row.id, !row.active);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That could not be changed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-[12.5px] text-text-3">
          {rows.filter((r) => r.active).length} on the form
          {off > 0 && `, ${off} switched off`}
        </span>
        <QuietButton className="h-9" onClick={() => setShowOff((v) => !v)}>
          {showOff ? "Hide switched off" : "Show switched off"}
        </QuietButton>
        <PrimaryButton onClick={() => setAdding(true)}>
          <IconPlus className="size-3.5" />
          Add a category
        </PrimaryButton>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {shown.length === 0 ? (
        <TableCard
          empty={
            <EmptyState
              icon={<IconCategory className="size-5" />}
              title="No categories yet"
              body="A category is what the money was for. The monthly summary reports on the group each one rolls up to."
            />
          }
        />
      ) : (
        // ONE list, not one card per group. The group still shows — it's what
        // the monthly summary rolls up to — but as a slim divider row inside a
        // single table, not a whole separate card repeating the same four
        // column headers. Eight groups used to mean eight cards and eight
        // "CATEGORY / ENTRIES / PAID OUT / STATUS" headers for what is mostly
        // one row each.
        <TableCard>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={cn(th, "w-full")}>Category</th>
                <th className={cn(th, "text-right")}>Entries</th>
                <th className={cn(th, "text-right")}>Paid out</th>
                <th className={th}>Status</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {[...byGroup.entries()].map(([group, list]) => (
                <React.Fragment key={group}>
                  <tr>
                    <td
                      colSpan={5}
                      className="border-b border-border bg-surface-2 px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase"
                    >
                      {group}
                    </td>
                  </tr>
                  {list.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-surface-2">
                      <td className={cn(td, "font-medium text-text-1")}>{r.name}</td>
                      <td className={cn(td, "num text-right")}>{r.used || "—"}</td>
                      <td className={cn(td, "num text-right font-semibold text-text-1")}>
                        {r.used ? formatMoney(r.spent) : "—"}
                      </td>
                      <td className={td}>
                        <Pill tone={r.active ? "green" : "grey"}>
                          {r.active ? "On the form" : "Switched off"}
                        </Pill>
                      </td>
                      <td className={cn(td, "text-right whitespace-nowrap")}>
                        <div className="flex justify-end gap-1.5">
                          <QuietButton onClick={() => setEditing(r)}>Edit</QuietButton>
                          <QuietButton
                            tone={r.active ? "danger" : "neutral"}
                            busy={busyId === r.id}
                            onClick={() => toggle(r)}
                          >
                            {r.active ? "Switch off" : "Switch on"}
                          </QuietButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      <p className="text-[11.5px] text-text-3">
        The group is what the monthly summary adds up. Renaming a category does
        not change what an old entry prints — every entry keeps the category
        name it was saved with.
      </p>

      {adding && <CategoryDialog groups={groups} onClose={() => setAdding(false)} />}
      {editing && (
        <CategoryDialog row={editing} groups={groups} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function CategoryDialog({
  row,
  groups,
  onClose,
}: {
  row?: CategoryRow;
  groups: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(row?.name ?? "");
  const [group, setGroup] = React.useState(row?.groupName ?? groups[0] ?? "");
  const [newGroup, setNewGroup] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const finalGroup = group === "__new" ? newGroup : group;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (row) await editCategory(row.id, name, finalGroup);
      else await addCategory(name, finalGroup);
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That could not be saved.");
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={row ? "Edit this category" : "Add a category"}
      subtitle="What the money was for, and which heading it reports under."
      footer={
        <>
          <DialogCancel onClick={onClose} disabled={busy} />
          <DialogSave
            onClick={save}
            busy={busy}
            disabled={!name.trim() || !finalGroup.trim()}
          >
            {row ? "Save" : "Add"}
          </DialogSave>
        </>
      }
    >
      <Field label="Category">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Auto fare"
        />
      </Field>

      <Field label="Rolls up to" hint="The heading the monthly summary adds it under.">
        <Select value={group} onChange={(e) => setGroup(e.target.value)}>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
          <option value="__new">A new group…</option>
        </Select>
      </Field>

      {group === "__new" && (
        <Field label="New group name">
          <Input
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            placeholder="Travel"
          />
        </Field>
      )}

      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}

// ─── who may use it ───────────────────────────────────────────────────────

/**
 * Roles, and the honest sentence about where they come from.
 *
 * Somebody who has never been given a role here but is an ERP administrator
 * still gets in as an admin — that is the bootstrap in `authz.ts`, and without
 * it nobody could ever grant the first role. The row says so in as many words
 * rather than showing "Runs Petty Cash" and letting them believe somebody
 * decided that on purpose.
 */
function People({ rows }: { rows: PettyCashPerson[] }) {
  const viewer = usePettyCashViewer();
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const change = async (userId: string, value: string) => {
    setBusyId(userId);
    setError(null);
    try {
      if (value === "__none") await clearPersonRole(userId);
      else await setPersonRole(userId, value);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That could not be changed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <ErrorNote>{error}</ErrorNote>

      {rows.length === 0 ? (
        <TableCard
          empty={
            <EmptyState
              icon={<IconShieldLock className="size-5" />}
              title="Nobody has been given Petty Cash"
              body="Tick people into it in Settings → Access first. This screen then decides what each of them may do."
            />
          }
        />
      ) : (
        <TableCard>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={cn(th, "w-full")}>Person</th>
                <th className={th}>What they may do</th>
                <th className={th}>How they got it</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const isSelf = p.userId === viewer.userId;
                const value = p.role && p.memberActive ? p.role : "__none";
                return (
                  <tr key={p.userId} className="transition-colors hover:bg-surface-2">
                    <td className={td}>
                      <div className="font-medium text-text-1">
                        {p.name}
                        {isSelf && (
                          <span className="ml-2 text-[11.5px] font-normal text-text-3">
                            you
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-text-3">{p.email}</div>
                    </td>
                    <td className={cn(td, "min-w-[210px]")}>
                      <Select
                        aria-label={`What ${p.name} may do`}
                        value={value}
                        disabled={isSelf || busyId === p.userId}
                        onChange={(e) => change(p.userId, e.target.value)}
                      >
                        <option value="__none">Not set</option>
                        {ROLE_ORDER.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_META[r].label}
                          </option>
                        ))}
                      </Select>
                      <p className="mt-1 text-[11.5px] leading-snug text-text-3">
                        {ROLE_META[p.effective].help}
                      </p>
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      {p.role && p.memberActive ? (
                        <Pill tone="blue">Given here</Pill>
                      ) : p.erpAdmin ? (
                        <Pill tone="amber">ERP administrator</Pill>
                      ) : (
                        <Pill tone="grey">Read only</Pill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}

      <p className="text-[11.5px] leading-relaxed text-text-3">
        This list is everybody ticked into Petty Cash in{" "}
        <strong className="font-semibold text-text-2">Settings → Access</strong>{" "}
        — that is what decides who may open it at all. An ERP administrator who
        has not been given a role here runs Petty Cash anyway, because otherwise
        nobody could give out the first one. You cannot change your own row.
      </p>
    </div>
  );
}
