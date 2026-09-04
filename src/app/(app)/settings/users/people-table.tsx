"use client";

import { useState, useTransition } from "react";
import { IconPencil, IconPlus, IconShieldLock } from "@tabler/icons-react";

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
import type { Department, Person } from "@/lib/people";
import { savePersonAccess } from "./actions";

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
                      {p.erpRole ? (
                        <Chip text={labelOf(ERP_ROLES, p.erpRole)} />
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
                    <td className="border-b border-border px-3.5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setEditing(p)}
                        aria-label={`Edit ${p.name}`}
                        className="grid size-8 cursor-pointer place-items-center rounded-field text-text-3 transition-colors hover:bg-surface-2 hover:text-text-1"
                      >
                        <IconPencil className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {(editing || adding) && (
        <PersonDialog
          person={editing}
          departments={departments}
          adminEmail={adminEmail}
          onClose={() => {
            setEditing(null);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function PersonDialog({
  person,
  departments,
  adminEmail,
  onClose,
}: {
  person: Person | null;
  departments: Department[];
  adminEmail: string;
  onClose: () => void;
}) {
  const isNew = person === null;
  const isSelf = !isNew && person.email === adminEmail;

  const [name, setName] = useState(person?.name ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [erp, setErp] = useState(
    person?.erpRole ?? (isNew ? "member" : "none"),
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
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add a person" : name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3.5 px-1">
          <div className="grid gap-3 sm:grid-cols-2">
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
              {/* Locked once it exists: the email is the key all three systems
                  are matched on, so changing it here would silently orphan
                  their Order Entry and Help Slip records rather than rename
                  them. */}
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!isNew}
                className="h-9"
              />
            </label>
          </div>

          <Field label="ERP" hint="Signing in at all, and admin rights.">
            <Picker
              value={erp}
              onChange={setErp}
              options={ERP_ROLES}
              disabled={isSelf}
            />
          </Field>

          <Field label="Orders & CRM" hint="Their role in Order Entry.">
            <Picker value={oe} onChange={setOe} options={OE_ROLES} />
          </Field>

          <Field label="Help Slip" hint="Raising and handling concerns.">
            <Picker value={hs} onChange={setHs} options={HS_ROLES} />
          </Field>

          {hs !== "none" && (
            <div className="flex flex-col gap-3 rounded-field border border-border bg-surface-2 p-3">
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
                  Complaints raised in confidence are hidden from everyone else,
                  including other coordinators.
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
    <Select
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
