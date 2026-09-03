"use client";

import * as React from "react";
import { IconSearch, IconUsers } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { HsModal, ModalCancel } from "@/components/help-slip/concern-parts";
import {
  CheckboxField,
  FieldGrid,
  SelectField,
  TextField,
} from "@/components/help-slip/form-parts";
import {
  CountChip,
  ListState,
  Panel,
  PanelHead,
  SearchField,
} from "@/components/help-slip/page-parts";
import { T } from "@/components/help-slip/type-scale";
import { Button } from "@/components/ui/button";
import { Table, TBody, THead, Th, Td, Tr } from "@/components/ui/data-table";
import { HScroll } from "@/components/ui/hscroll";
import { Spinner } from "@/components/ui/spinner";
import {
  USER_ROLES,
  type AccountStatus,
  type UserRole,
} from "@/db/help-slip/schema";
import { helpSlipGet, helpSlipSend } from "@/lib/help-slip/api-client";
import { accountStatusLabel, roleLabel } from "@/lib/help-slip/meta";
import type { SettingsUserRow } from "@/lib/help-slip/settings";
import { cn } from "@/lib/utils";

type Payload = {
  users: SettingsUserRow[];
  departments: { id: string; name: string }[];
  role: UserRole;
  tabs: Record<string, boolean>;
};

/**
 * Users and Access — who is in Help Slip, and what they may see.
 *
 * ── THE ROLE AND ACCESS CONTROLS ARE ADMIN-ONLY, AND SAYING SO MATTERS ────
 *
 * `guard_profile_columns` does not refuse a coordinator's change to `role` or
 * `hr_access` — it silently rewrites the column back and lets the UPDATE
 * succeed. That was verified against the live database. So a screen that POSTs
 * and trusts the 200 tells a coordinator their change saved when it did not,
 * about the one setting that decides who can read HR complaints.
 *
 * Two defences, and the second is the real one:
 *
 *   1. Those two controls are DISABLED for a coordinator, with a sentence
 *      saying why, and the request omits both fields entirely — so the common
 *      case never becomes a silent failure.
 *   2. The route re-reads the row after every write and compares it against
 *      what was asked for. Anything the database threw away comes back as a
 *      403 naming the field, and this dialog shows that sentence.
 *
 * ── THERE IS NO ADD-A-PERSON BUTTON ───────────────────────────────────────
 *
 * `profiles.id` is a foreign key to `auth.users.id`: a person cannot exist here
 * until they have signed in at least once. They arrive through Access requests.
 * A create form would have to make a sign-in account first, which is a
 * different system — so the screen says where people come from rather than
 * offering a button that cannot work.
 */
export function UsersPanel() {
  const queryClient = useQueryClient();
  const key = React.useMemo(() => ["help-slip", "settings", "users"], []);

  const q = useQuery({
    queryKey: key,
    queryFn: () => helpSlipGet<Payload>("/api/help-slip/settings/users"),
  });

  const [term, setTerm] = React.useState("");
  const [editing, setEditing] = React.useState<SettingsUserRow | null>(null);

  const users = React.useMemo(() => q.data?.users ?? [], [q.data]);
  const isAdmin = q.data?.role === "admin";

  const filtered = React.useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return users;
    return users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(t) ||
        u.loginId.toLowerCase().includes(t) ||
        (u.departmentName ?? "").toLowerCase().includes(t),
    );
  }, [users, term]);

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHead
          titleEn="People"
          icon={<IconUsers stroke={1.6} />}
          aside={<CountChip>{filtered.length}</CountChip>}
        />
        <div className="border-b border-border px-4 py-3">
          <SearchField
            value={term}
            onChange={setTerm}
            label="Search people"
            placeholder="Name, email or department"
          />
        </div>
        <ListState
          loading={q.isPending}
          error={q.isError ? (q.error as Error).message : null}
          onRetry={() => void q.refetch()}
          isEmpty={filtered.length === 0}
          empty={{
            icon: term ? IconSearch : IconUsers,
            titleEn: term ? "Nobody matches that." : "Nobody here yet.",
            bodyEn: term
              ? "Try a different name or email."
              : "People appear once they sign in and an admin approves them.",
            action: term
              ? { label: "Clear search", onClick: () => setTerm("") }
              : undefined,
          }}
        >
          <HScroll>
            <Table>
              <THead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Signs in as</Th>
                  <Th>Role</Th>
                  <Th>Department</Th>
                  <Th>Confidential</Th>
                  <Th>Status</Th>
                  <Th> </Th>
                </Tr>
              </THead>
              <TBody>
                {filtered.map((u) => (
                  <Tr key={u.id}>
                    <Td className="font-semibold text-text-1">{u.fullName}</Td>
                    <Td className="text-text-3">{u.loginId}</Td>
                    <Td>{roleLabel(u.role)}</Td>
                    <Td>{u.departmentName ?? "—"}</Td>
                    <Td>
                      {u.hrAccess ? (
                        <span className="rounded-pill bg-status-amber-dim px-2 py-0.5 text-[11px] font-semibold text-status-amber uppercase">
                          Yes
                        </span>
                      ) : (
                        <span className="text-text-3">No</span>
                      )}
                    </Td>
                    <Td>
                      <span
                        className={cn(
                          "rounded-pill px-2 py-0.5 text-[11px] font-semibold uppercase",
                          u.status === "active"
                            ? "bg-status-green-dim text-status-green"
                            : "bg-chip text-text-3",
                        )}
                      >
                        {accountStatusLabel(u.status)}
                      </span>
                    </Td>
                    <Td>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-11 md:h-8"
                        onClick={() => setEditing(u)}
                      >
                        Edit
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </HScroll>
        </ListState>
      </Panel>

      <p className={cn("text-text-3", T.caption)}>
        People cannot be added here. A Help Slip account is tied to a sign-in
        account, so somebody joins by signing in and being approved under{" "}
        <strong className="font-semibold text-text-2">Access requests</strong>.
      </p>

      {editing ? (
        <EditUserDialog
          user={editing}
          departments={q.data?.departments ?? []}
          isAdmin={Boolean(isAdmin)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void queryClient.invalidateQueries({ queryKey: key });
          }}
        />
      ) : null}
    </div>
  );
}

function EditUserDialog({
  user,
  departments,
  isAdmin,
  onClose,
  onSaved,
}: {
  user: SettingsUserRow;
  departments: { id: string; name: string }[];
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = React.useState(user.fullName);
  const [phone, setPhone] = React.useState(user.phone ?? "");
  const [departmentId, setDepartmentId] = React.useState(
    user.departmentId ?? "",
  );
  const [role, setRole] = React.useState<UserRole>(user.role);
  const [hrAccess, setHrAccess] = React.useState(user.hrAccess);
  const [status, setStatus] = React.useState<AccountStatus>(user.status);

  const save = useMutation({
    mutationFn: () =>
      helpSlipSend<{ user: SettingsUserRow }>(
        `/api/help-slip/settings/users/${user.id}`,
        "PATCH",
        {
          fullName,
          phone: phone.trim() || null,
          departmentId: departmentId || null,
          // Sent by an ADMIN only. A coordinator's request carries neither
          // field, so the trigger has nothing to rewrite and the route never
          // has to decide whether an unchanged value was an attempt.
          ...(isAdmin ? { role, hrAccess } : {}),
          status,
        },
      ),
    onSuccess: onSaved,
  });

  return (
    <HsModal
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      titleEn={`Edit ${user.fullName}`}
      descriptionEn={user.loginId}
      error={save.isError ? (save.error as Error).message : undefined}
      footer={
        <>
          <ModalCancel disabled={save.isPending} />
          <Button
            type="button"
            disabled={save.isPending}
            className="h-11 md:h-9"
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Spinner /> : null}
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FieldGrid cols={2}>
          <TextField
            id="user-name"
            labelEn="Full name"
            value={fullName}
            onChange={setFullName}
            required
            disabled={save.isPending}
          />
          <TextField
            id="user-phone"
            labelEn="Phone"
            value={phone}
            onChange={setPhone}
            disabled={save.isPending}
          />
          <SelectField
            id="user-dept"
            labelEn="Department"
            value={departmentId}
            onChange={setDepartmentId}
            placeholder="No department"
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
            disabled={save.isPending}
          />
          <SelectField
            id="user-status"
            labelEn="Account status"
            helperEn="Inactive people cannot sign in."
            value={status}
            onChange={(v) => setStatus(v as AccountStatus)}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "suspended", label: "Suspended" },
            ]}
            disabled={save.isPending}
          />
          <SelectField
            id="user-role"
            labelEn="Role"
            helperEn={isAdmin ? undefined : "Only an admin can change this."}
            value={role}
            onChange={(v) => setRole(v as UserRole)}
            options={USER_ROLES.map((r) => ({ value: r, label: roleLabel(r) }))}
            disabled={save.isPending || !isAdmin}
          />
        </FieldGrid>

        <div className="rounded-field border border-border bg-surface-2 px-3 py-2">
          <CheckboxField
            id="user-hr"
            checked={hrAccess}
            onChange={setHrAccess}
            labelEn="Can open confidential complaints"
            descriptionEn={
              isAdmin
                ? "Confidential concerns are hidden from every coordinator except those with this."
                : "Only an admin can change this."
            }
            disabled={save.isPending || !isAdmin}
          />
        </div>
      </div>
    </HsModal>
  );
}
