"use client";

import { useEffect, useState, useTransition } from "react";
import {
  IconAlertTriangle,
  IconPencil,
  IconPlus,
  IconShieldLock,
  IconTrash,
  IconUserOff,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Department, Footprint, Person } from "@/lib/people";
import {
  deletePersonAction,
  getPersonFootprint,
  removeAllAccess,
  savePersonAccess,
} from "./actions";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  People — one row per person, three systems across
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This replaces three separate user screens: ERP Settings → Users, Order Entry
 * Settings → Users, and Help Slip Settings → Users & Access. Adding a joiner
 * used to mean all three, in three places, so people were added to one and
 * forgotten in the others — there were fourteen records for what should have
 * been one team, and exactly one person existed in all three.
 *
 * ── WHY "NONE" IS A ROLE ──────────────────────────────────────────────────
 *
 * Every system's picker has a "No access" option, and it is the important one.
 * The old screens could only describe people who were already in them; there
 * was no way to see that somebody had Order Entry but not the ERP. Here the
 * absence is on screen, in the same row, which is how you notice it.
 *
 * ── WHAT REMOVING ACCESS DOES ─────────────────────────────────────────────
 *
 * Deactivates, never deletes — see the note on `savePersonAccess`. Order Entry
 * rows are shared with the live standalone app and Help Slip profiles cascade
 * to a person's concerns. "No access" means they cannot get in, not that their
 * history is erased.
 */

const ERP_ROLES = [
  { v: "none", label: "No access" },
  { v: "member", label: "Member" },
  { v: "admin", label: "Administrator" },
];
const OE_ROLES = [
  { v: "none", label: "No access" },
  { v: "ADMIN", label: "Admin" },
  { v: "SALES", label: "Sales" },
  { v: "OPS", label: "Operations" },
  { v: "CRM", label: "CRM" },
  { v: "VIEWER", label: "Viewer" },
];
const HS_ROLES = [
  { v: "none", label: "No access" },
  { v: "employee", label: "Employee" },
  { v: "pc", label: "Coordinator" },
  { v: "admin", label: "Admin" },
];

function Chip({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-block rounded-pill px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        muted
          ? "bg-chip text-text-3"
          : "bg-accent text-accent-text ring-1 ring-accent-text/15 ring-inset",
      )}
    >
      {text}
    </span>
  );
}

const labelOf = (list: { v: string; label: string }[], v: string | null) =>
  list.find((x) => x.v === (v ?? "none"))?.label ?? v ?? "No access";

export function PeopleTable({
  people,
  departments,
  adminEmail,
}: {
  people: Person[];
  departments: Department[];
  /** So the screen can stop an admin locking themselves out. */
  adminEmail: string;
}) {
  const [editing, setEditing] = useState<Person | null>(null);
  const [adding, setAdding] = useState(false);
  // A separate trigger from `editing`, purely so the dialog knows to open
  // straight into the danger-zone section instead of the role pickers — the
  // safety checks (footprint lookup, confirm step) still live in one place.
  const [removeTarget, setRemoveTarget] = useState<Person | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-text-1">People</h2>
          <p className="mt-0.5 text-[13px] text-text-3">
            {people.length} people, and what each one can open. Everything for a
            person is set here — there is no second screen.
          </p>
        </div>
        <Button size="sm" className="h-9" onClick={() => setAdding(true)}>
          <IconPlus className="size-4" /> Add person
        </Button>
      </div>

      <div className="rounded-card border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Person", "ERP", "Orders", "Help Slip", ""].map((h, i) => (
                  <th
                    key={h || i}
                    className="border-b border-border px-3.5 pt-3.5 pb-2.5 text-left text-[11px] font-bold tracking-[0.04em] text-text-1 uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {people.map((p) => {
                const inactive = p.erpStatus === "inactive";
                return (
                  <tr key={p.email} className={inactive ? "opacity-55" : ""}>
                    <td className="border-b border-border px-3.5 py-3">
                      <div className="font-semibold text-text-1">{p.name}</div>
                      <div className="num text-[12px] text-text-3">
                        {p.email}
                      </div>
                    </td>
                    <td className="border-b border-border px-3.5 py-3">
                      {/* An INACTIVE account still carries its old role, so
                          reading `erpRole` alone printed "Member" for somebody
                          who had just been switched off — the change looked
                          like it had not saved. Status decides first. */}
                      {p.erpRole && !inactive ? (
                        <Chip text={labelOf(ERP_ROLES, p.erpRole)} />
                      ) : inactive ? (
                        <Chip text="Switched off" muted />
                      ) : (
                        <Chip text="No access" muted />
                      )}
                    </td>
                    <td className="border-b border-border px-3.5 py-3">
                      {p.orderEntryRole && p.orderEntryActive ? (
                        <Chip text={labelOf(OE_ROLES, p.orderEntryRole)} />
                      ) : (
                        <Chip text="No access" muted />
                      )}
                    </td>
                    <td className="border-b border-border px-3.5 py-3">
                      {p.helpSlipRole && p.helpSlipStatus === "active" ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Chip text={labelOf(HS_ROLES, p.helpSlipRole)} />
                          {p.helpSlipHrAccess && (
                            <span
                              title="Can open confidential concerns"
                              className="inline-flex items-center gap-1 rounded-pill bg-chip px-2 py-0.5 text-[11px] font-semibold text-text-2"
                            >
                              <IconShieldLock className="size-3" />
                              Confidential
                            </span>
                          )}
                        </span>
                      ) : (
                        <Chip text="No access" muted />
                      )}
                    </td>
                    <td className="border-b border-border px-3.5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(p)}
                          aria-label={`Edit ${p.name}`}
                          className="grid size-8 cursor-pointer place-items-center rounded-field text-text-3 transition-colors hover:bg-surface-2 hover:text-text-1"
                        >
                          <IconPencil className="size-4" />
                        </button>
                        {/* Hidden, not disabled, on your own row — you can't
                            remove yourself, and a dead trash icon just invites
                            a click to find out why. */}
                        {p.email !== adminEmail ? (
                          <button
                            type="button"
                            onClick={() => setRemoveTarget(p)}
                            aria-label={`Remove ${p.name}`}
                            className="grid size-8 cursor-pointer place-items-center rounded-field text-text-3 transition-colors hover:bg-status-red-dim hover:text-status-red"
                          >
                            <IconTrash className="size-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {(editing || adding || removeTarget) && (
        <PersonDialog
          person={editing ?? removeTarget}
          startAtRemove={!!removeTarget}
          departments={departments}
          adminEmail={adminEmail}
          onClose={() => {
            setEditing(null);
            setAdding(false);
            setRemoveTarget(null);
          }}
        />
      )}
    </div>
  );
}

function PersonDialog({
  person,
  startAtRemove = false,
  departments,
  adminEmail,
  onClose,
}: {
  person: Person | null;
  /** Opened via the row's trash icon — skip straight to the danger zone. */
  startAtRemove?: boolean;
  departments: Department[];
  adminEmail: string;
  onClose: () => void;
}) {
  const isNew = person === null;
  const isSelf = !isNew && person.email === adminEmail;

  const [name, setName] = useState(person?.name ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  // Status first, for the same reason as the table: a switched-off account
  // keeps its old role, so reading `erpRole` alone reopened the dialog showing
  // "Member" for somebody who had already been removed.
  const [erp, setErp] = useState(
    isNew
      ? "member"
      : person.erpRole && person.erpStatus === "active"
        ? person.erpRole
        : "none",
  );
  const [oe, setOe] = useState(
    person?.orderEntryRole && person.orderEntryActive
      ? person.orderEntryRole
      : "none",
  );
  const [hs, setHs] = useState(
    person?.helpSlipRole && person.helpSlipStatus === "active"
      ? person.helpSlipRole
      : "none",
  );
  const [dept, setDept] = useState(person?.helpSlipDepartmentId ?? "none");
  const [hr, setHr] = useState(person?.helpSlipHrAccess ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // `null` until asked for, so the count queries only run if somebody opens the
  // remove section — most edits are a role change and never need them.
  const [footprint, setFootprint] = useState<Footprint | null>(null);
  const [showRemove, setShowRemove] = useState(startAtRemove);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const openRemove = () => {
    setShowRemove(true);
    setError(null);
    if (!isNew && !footprint) {
      start(async () => {
        try {
          setFootprint(await getPersonFootprint(person.email));
        } catch {
          // Leaving it null keeps Delete unavailable, which is the safe way to
          // fail — Remove access does not depend on it.
        }
      });
    }
  };

  // The row's trash icon skips the "Remove…" link entirely, so it has to
  // trigger the same footprint lookup itself, once, on open.
  useEffect(() => {
    if (startAtRemove) openRemove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = (fn: () => Promise<void>) => {
    setError(null);
    start(async () => {
      try {
        await fn();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "That didn't work.");
      }
    });
  };

  const save = () => {
    setError(null);
    start(async () => {
      try {
        await savePersonAccess({
          email,
          name,
          erpRole: erp === "none" ? null : (erp as "member" | "admin"),
          orderEntryRole: oe === "none" ? null : (oe as never),
          helpSlipRole: hs === "none" ? null : (hs as never),
          helpSlipDepartmentId: dept === "none" ? null : dept,
          helpSlipHrAccess: hr,
        });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "That didn't save.");
      }
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add a person" : name}</DialogTitle>
          {!isNew ? (
            <p className="num text-[12.5px] text-text-3">{person.email}</p>
          ) : null}
        </DialogHeader>

        <div className="flex flex-col gap-5 px-1">
          <section className="flex flex-col gap-3">
            <SectionLabel>Account</SectionLabel>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-medium text-text-2">
                  Name
                </span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-medium text-text-2">
                  Email
                </span>
                {/* Locked once it exists: the email is the key all three
                    systems are matched on, so changing it here would
                    silently orphan their Order Entry and Help Slip records
                    rather than rename them. */}
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!isNew}
                  className="h-9"
                />
              </label>
            </div>
          </section>

          <div className="h-px bg-border" />

          <section className="flex flex-col gap-3">
            <SectionLabel>Access</SectionLabel>
            <div className="flex flex-col gap-3 rounded-field border border-border-strong bg-surface p-3.5 shadow-sm">
              <Field label="ERP" hint="Signing in at all, and admin rights.">
                <Picker
                  value={erp}
                  onChange={setErp}
                  options={ERP_ROLES}
                  disabled={isSelf}
                />
              </Field>

              <div className="h-px bg-border" />

              <Field label="Orders & CRM" hint="Their role in Order Entry.">
                <Picker value={oe} onChange={setOe} options={OE_ROLES} />
              </Field>

              <div className="h-px bg-border" />

              <Field label="Help Slip" hint="Raising and handling concerns.">
                <Picker value={hs} onChange={setHs} options={HS_ROLES} />
              </Field>
            </div>

            {hs !== "none" && (
              <div className="flex flex-col gap-3 rounded-field border border-border-strong bg-surface p-3.5 shadow-sm">
                <Field label="Department" hint="Used to route their concerns.">
                  <Picker
                    value={dept}
                    onChange={setDept}
                    options={[
                      { v: "none", label: "Not set" },
                      ...departments.map((d) => ({ v: d.id, label: d.name })),
                    ]}
                  />
                </Field>
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={hr}
                    onChange={(e) => setHr(e.target.checked)}
                    className="mt-0.5 size-4"
                  />
                  <span className="text-[12.5px] text-text-2">
                    <span className="font-medium text-text-1">
                      Can open confidential concerns
                    </span>
                    <br />
                    Complaints raised in confidence are hidden from everyone
                    else, including other coordinators.
                  </span>
                </label>
              </div>
            )}

            {isSelf && (
              <p className="text-[12px] text-text-3">
                This is your own account, so your ERP role is locked — with no
                active administrator, nobody could promote one back.
              </p>
            )}
          </section>

          {/* ── taking somebody out ─────────────────────────────────────
              Behind a link rather than on the surface: this is the rare
              action, and two red buttons under every routine role change is
              how somebody clicks one by accident. But it IS here, with a
              name, which it was not before — the only way to remove access
              used to be setting three dropdowns to "No access" one at a
              time, and nobody would guess that. */}
          {!isNew && !isSelf && (
            <>
              <div className="h-px bg-border" />
              <section className="flex flex-col gap-3">
                <SectionLabel tone="danger">Danger zone</SectionLabel>
                <div className="rounded-field border border-status-red/25 bg-surface p-3.5 shadow-sm">
                  {!showRemove ? (
                    <button
                      type="button"
                      onClick={openRemove}
                      className="cursor-pointer text-[12.5px] font-medium text-text-3 underline underline-offset-2 hover:text-status-red"
                    >
                      Remove {name.trim() || "this person"} from the system…
                    </button>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start gap-2.5">
                        <IconUserOff className="mt-0.5 size-4 shrink-0 text-text-3" />
                        <div className="text-[12.5px] text-text-2">
                          <div className="font-semibold text-text-1">
                            Switch off their access
                          </div>
                          They keep their record and everything they have ever
                          done keeps their name on it. Give the roles back and
                          they are in again.
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 self-start"
                        disabled={pending}
                        onClick={() => run(() => removeAllAccess(person.email))}
                      >
                        Switch off all access
                      </Button>

                      <div className="border-t border-border pt-3">
                        {footprint === null ? (
                          <p className="text-[12.5px] text-text-3">
                            Checking what else refers to them…
                          </p>
                        ) : footprint.blockers.length > 0 ? (
                          <div className="flex items-start gap-2.5">
                            <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-text-3" />
                            <p className="text-[12.5px] text-text-2">
                              <span className="font-semibold text-text-1">
                                They cannot be deleted.
                              </span>{" "}
                              There{" "}
                              {footprint.blockers.length === 1 ? "is" : "are"}{" "}
                              {footprint.blockers
                                .map(
                                  (b) =>
                                    `${b.count} ${b.count === 1 ? b.one : b.many}`,
                                )
                                .join(", ")}{" "}
                              on this account. Deleting it would leave that work
                              with no name on it — switch off their access
                              instead.
                            </p>
                          </div>
                        ) : !confirmDelete ? (
                          <div className="flex flex-col gap-2.5">
                            <p className="text-[12.5px] text-text-2">
                              <span className="font-semibold text-text-1">
                                Nothing refers to this account.
                              </span>{" "}
                              No orders, no concerns, no recorded actions — so
                              it can be deleted outright. Use this for
                              duplicates and leftover test accounts, not for
                              people who have left.
                            </p>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(true)}
                              className="cursor-pointer self-start text-[12.5px] font-semibold text-status-red underline underline-offset-2"
                            >
                              Delete permanently
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2.5">
                            <p className="text-[12.5px] font-semibold text-status-red">
                              Delete {person.email} from all three systems? This
                              cannot be undone.
                            </p>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-9"
                                disabled={pending}
                                onClick={() =>
                                  run(() => deletePersonAction(person.email))
                                }
                              >
                                {pending ? "Deleting…" : "Yes, delete"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-9"
                                disabled={pending}
                                onClick={() => setConfirmDelete(false)}
                              >
                                Keep it
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-field border border-status-red/30 bg-status-red-dim px-3 py-2 text-[12.5px] text-status-red"
            >
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={pending || !name.trim() || !email.trim()}
          >
            {pending ? "Saving…" : isNew ? "Add person" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <div
      className={cn(
        "text-[11px] font-bold tracking-[0.06em] uppercase",
        tone === "danger" ? "text-status-red/80" : "text-text-3",
      )}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-text-1">{label}</div>
        <div className="text-[11.5px] text-text-3">{hint}</div>
      </div>
      <div className="w-[190px] shrink-0">{children}</div>
    </div>
  );
}

function Picker({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { v: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    // Base UI hands back `string | null` (null when a selection is cleared),
    // so it is normalised here rather than widening every caller's setter.
    //
    // `items` is NOT optional decoration. Without it Base UI's <Select.Value>
    // renders the raw VALUE, so these three dropdowns read "member", "SALES"
    // and "none" instead of "Member", "Sales" and "No access" — which is why
    // removing somebody's access looked impossible: the one option that does it
    // was labelled `none` and did not read as a choice at all.
    <Select
      items={Object.fromEntries(options.map((o) => [o.v, o.label]))}
      value={value}
      onValueChange={(v) => onChange(v ?? "none")}
      disabled={disabled}
    >
      <SelectTrigger className="h-9 w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.v} value={o.v}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
