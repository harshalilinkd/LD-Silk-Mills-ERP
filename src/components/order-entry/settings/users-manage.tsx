"use client";

// Settings → Users — docs/SCREENS.md §6.5. Manages ld_order_entry.users: who
// has an Order Entry account and at what access level (role). WHAT each role
// may do is the Access tab. NOTE: this is not the ERP shell's own /admin/users
// list.
//
// Two renderings, ONE set of controls. The desktop table and the mobile
// stacked cards both call `nameEditor()`, `roleSelect()`, `statusToggle()` and
// `userActions()`, so the phone and the desktop cannot drift into offering
// different actions — which is exactly what happens when the small screen gets
// its own hand-written copy of the row.
//
// The server enforces the self-protection rules (you can't change your own
// role, deactivate yourself or delete yourself, and the last active admin must
// remain). Rather than duplicate that logic, this UI surfaces the server's 409
// message inline on the row that triggered it — the server is the only
// authority, so its wording is what the admin sees.
import { useCallback, useEffect, useState } from "react";
import {
  IconKey,
  IconPencil,
  IconTrash,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import { ROLES, type Role } from "@/lib/order-entry/rbac";
import { Button } from "@/components/ui/button";
import {
  EmptyRow,
  ErrorBanner,
  INPUT_CLS,
  LABEL_CLS,
  LoadingRow,
  NoticeBanner,
  Panel,
  Pill,
  TD_CLS,
  TH_CLS,
  apiJson,
} from "./settings-ui";
import { cn } from "@/lib/utils";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
};

type UsersResponse = { users: UserRow[]; current_user_id: string };

export function UsersManage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Errors are split so a failed row action never blows away the create form's
  // own message (and vice versa).
  const [listError, setListError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Create form
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("VIEWER");
  const [password, setPassword] = useState("");

  // Per-row modes. All three are row states, not dialogs (§6.5): renaming is
  // an inline editor, resetting takes a new password inline, deleting is a
  // two-step confirm in the same strip of buttons.
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiJson<UsersResponse>("/api/order-entry/users");
    setLoading(false);
    if (!res.ok) {
      setListError(res.error);
      return;
    }
    setListError(null);
    setUsers(res.data.users);
    setSelfId(res.data.current_user_id);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(
    u: UserRow,
    body: Record<string, unknown>,
    message: string,
  ): Promise<boolean> {
    setBusy(true);
    setRowError(null);
    setNotice(null);
    const res = await apiJson(`/api/order-entry/users/${u.id}`, {
      method: "PATCH",
      body,
    });
    if (!res.ok) {
      setBusy(false);
      setRowError({ id: u.id, message: res.error });
      return false;
    }
    await load();
    setBusy(false);
    setNotice(message);
    return true;
  }

  async function createUser() {
    setBusy(true);
    setCreateError(null);
    setNotice(null);
    const res = await apiJson("/api/order-entry/users", {
      method: "POST",
      body: {
        email: email.trim(),
        name: name.trim() || null,
        role,
        password,
      },
    });
    if (!res.ok) {
      setBusy(false);
      setCreateError(res.error);
      return;
    }
    await load();
    setBusy(false);
    setEmail("");
    setName("");
    setRole("VIEWER");
    setPassword("");
    setNotice("User created.");
  }

  async function deleteUser(u: UserRow) {
    setBusy(true);
    setRowError(null);
    setNotice(null);
    const res = await apiJson(`/api/order-entry/users/${u.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setBusy(false);
      setConfirmId(null);
      setRowError({ id: u.id, message: res.error });
      return;
    }
    await load();
    setBusy(false);
    setConfirmId(null);
    setNotice(`Deleted ${u.email}.`);
  }

  const canCreate = email.trim().includes("@") && password.length >= 8;

  // -------------------------------------------------------------------------
  // Shared per-user controls. Both renderings below call exactly these.
  // -------------------------------------------------------------------------

  /** The inline rename editor — name over email. */
  const nameEditor = () => (
    <div className="flex max-w-xs flex-col gap-1.5">
      <input
        className={cn(INPUT_CLS, "h-8")}
        value={editName}
        onChange={(e) => setEditName(e.target.value)}
        placeholder="Full name"
        aria-label="Full name"
      />
      <input
        type="email"
        className={cn(INPUT_CLS, "h-8 font-mono")}
        value={editEmail}
        onChange={(e) => setEditEmail(e.target.value)}
        placeholder="Email"
        aria-label="Email"
      />
    </div>
  );

  /** Name (or the email's local part) + the accent "you" pill + the email. */
  const userIdentity = (u: UserRow, isSelf: boolean) => (
    <>
      <div className="flex items-center gap-2 font-semibold text-text-1">
        {u.name || u.email.split("@")[0]}
        {isSelf && <Pill tone="accent">you</Pill>}
      </div>
      <div className="truncate font-mono text-[11.5px] text-text-3">
        {u.email}
      </div>
    </>
  );

  const roleSelect = (u: UserRow, isSelf: boolean) => (
    <select
      className={cn(INPUT_CLS, "h-8 w-[110px]")}
      value={u.role}
      disabled={busy || isSelf}
      aria-label={`Role for ${u.email}`}
      title={isSelf ? "You can't change your own role" : undefined}
      onChange={(e) =>
        void patch(
          u,
          { role: e.target.value as Role },
          `${u.email} is now ${e.target.value}.`,
        )
      }
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );

  const statusToggle = (u: UserRow, isSelf: boolean) => (
    <button
      type="button"
      disabled={busy || isSelf}
      title={
        isSelf
          ? "You can't deactivate your own account"
          : u.is_active
            ? "Click to deactivate"
            : "Click to activate"
      }
      onClick={() =>
        void patch(
          u,
          { is_active: !u.is_active },
          u.is_active ? `${u.email} deactivated.` : `${u.email} activated.`,
        )
      }
      className={cn(
        "shrink-0 rounded-full px-2.5 py-[3px] text-[10.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        u.is_active
          ? "bg-status-green-dim text-status-green"
          : "bg-chip text-text-3",
      )}
    >
      {u.is_active ? "Active" : "Inactive"}
    </button>
  );

  const userActions = (u: UserRow, isSelf: boolean) => {
    if (editId === u.id) {
      return (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="sm"
            disabled={busy || !editEmail.trim().includes("@")}
            onClick={async () => {
              const ok = await patch(
                u,
                { name: editName.trim() || null, email: editEmail.trim() },
                "User updated.",
              );
              if (ok) setEditId(null);
            }}
          >
            Save
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Cancel edit"
            onClick={() => setEditId(null)}
          >
            <IconX />
          </Button>
        </div>
      );
    }
    if (resetId === u.id) {
      return (
        <div className="flex items-center justify-end gap-1.5">
          {/* There is no self-serve reset — the login screen's "Forgot
              password?" points at an admin, and this is that admin. */}
          <input
            type="text"
            value={resetPw}
            autoFocus
            onChange={(e) => setResetPw(e.target.value)}
            placeholder="New password"
            aria-label={`New password for ${u.email}`}
            className={cn(INPUT_CLS, "h-8 w-40")}
          />
          <Button
            size="sm"
            disabled={busy || resetPw.length < 8}
            onClick={async () => {
              const ok = await patch(
                u,
                { password: resetPw },
                "Password reset.",
              );
              if (ok) {
                setResetId(null);
                setResetPw("");
              }
            }}
          >
            Save
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Cancel reset"
            onClick={() => {
              setResetId(null);
              setResetPw("");
            }}
          >
            <IconX />
          </Button>
        </div>
      );
    }
    if (confirmId === u.id) {
      return (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <span className="text-[12px] text-status-red">Delete user?</span>
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => void deleteUser(u)}
          >
            {busy ? "Deleting…" : "Delete"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
            Cancel
          </Button>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-end gap-0.5">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Edit name and email"
          title="Edit name & email"
          disabled={busy}
          onClick={() => {
            setEditId(u.id);
            setResetId(null);
            setConfirmId(null);
            setEditName(u.name ?? "");
            setEditEmail(u.email);
          }}
        >
          <IconPencil />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Reset password"
          title="Reset password"
          disabled={busy}
          onClick={() => {
            setResetId(u.id);
            setEditId(null);
            setConfirmId(null);
            setResetPw("");
          }}
        >
          <IconKey />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Delete user"
          title={isSelf ? "You can't delete your own account" : "Delete user"}
          className="text-status-red hover:bg-status-red-dim hover:text-status-red"
          disabled={busy || isSelf}
          onClick={() => {
            setConfirmId(u.id);
            setEditId(null);
            setResetId(null);
          }}
        >
          <IconTrash />
        </Button>
      </div>
    );
  };

  const rowErrorFor = (u: UserRow) =>
    rowError?.id === u.id ? (
      <p className="mt-1.5 text-[11.5px] font-medium text-status-red">
        {rowError.message}
      </p>
    ) : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
      <Panel
        title="Users"
        description="Who has an Order Entry account, and at what access level."
        bodyClassName="flex flex-col gap-3 px-0 py-0"
      >
        <div className="flex flex-col gap-2.5 px-[18px] pt-4 empty:hidden">
          <ErrorBanner message={listError} />
          <NoticeBanner message={notice} />
        </div>

        {loading ? (
          <LoadingRow />
        ) : users.length === 0 ? (
          <EmptyRow
            icon={IconUsers}
            title="No Order Entry users yet"
            description="Add the first account with the form on the right."
          />
        ) : (
          <>
            {/* Mobile: the same four controls as stacked cards. */}
            <ul className="flex flex-col gap-2.5 px-[18px] pb-1 md:hidden">
              {users.map((u) => {
                const isSelf = u.id === selfId;
                return (
                  <li
                    key={u.id}
                    className="rounded-field border border-border bg-surface-2 p-3"
                  >
                    {editId === u.id ? (
                      nameEditor()
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">{userIdentity(u, isSelf)}</div>
                        {statusToggle(u, isSelf)}
                      </div>
                    )}
                    {rowErrorFor(u)}
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                      {roleSelect(u, isSelf)}
                      {userActions(u, isSelf)}
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Desktop: the table. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[620px] border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className={TH_CLS}>User</th>
                    <th className={TH_CLS}>Role</th>
                    <th className={TH_CLS}>Status</th>
                    <th className={cn(TH_CLS, "text-right")}>Actions</th>
                  </tr>
                </thead>
                <tbody className="[&>tr:last-child>td]:border-b-0">
                  {users.map((u) => {
                    const isSelf = u.id === selfId;
                    return (
                      <tr
                        key={u.id}
                        className="align-middle hover:bg-surface-2"
                      >
                        <td className={cn(TD_CLS, "min-w-[220px]")}>
                          {editId === u.id
                            ? nameEditor()
                            : userIdentity(u, isSelf)}
                          {rowErrorFor(u)}
                        </td>
                        <td className={TD_CLS}>{roleSelect(u, isSelf)}</td>
                        <td className={TD_CLS}>{statusToggle(u, isSelf)}</td>
                        <td className={cn(TD_CLS, "text-right")}>
                          {userActions(u, isSelf)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p className="border-t border-border px-[18px] py-3 text-[11.5px] text-text-3">
          Role changes take effect on the user&apos;s next request. Settings and
          user management stay ADMIN-only and can&apos;t be granted in the
          Access tab.
        </p>
      </Panel>

      <Panel title="Add user" bodyClassName="flex flex-col gap-3.5">
        <form
          className="flex flex-col gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (canCreate) void createUser();
          }}
        >
          <div>
            <label className={LABEL_CLS} htmlFor="u-email">
              Email <span className="text-status-red">*</span>
            </label>
            <input
              id="u-email"
              type="email"
              className={cn(INPUT_CLS, "font-mono")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@company.com"
            />
          </div>
          <div>
            <label className={LABEL_CLS} htmlFor="u-name">
              Full name
            </label>
            <input
              id="u-name"
              className={INPUT_CLS}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
            />
          </div>
          <div>
            <label className={LABEL_CLS} htmlFor="u-role">
              Access level (role)
            </label>
            <select
              id="u-role"
              className={INPUT_CLS}
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11.5px] text-text-3">
              Set what each role can reach in the{" "}
              <span className="font-semibold text-text-2">Access</span> tab.
            </p>
          </div>
          <div>
            <label className={LABEL_CLS} htmlFor="u-pw">
              Temporary password <span className="text-status-red">*</span>
            </label>
            <input
              id="u-pw"
              type="text"
              className={INPUT_CLS}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
            <p className="mt-1 text-[11.5px] text-text-3">
              Share it with the user; they can change it later. Google-only
              users have no password at all and are never auto-provisioned —
              Google sign-in is restricted to accounts that already exist here.
            </p>
          </div>
          <ErrorBanner message={createError} />
          <Button type="submit" size="lg" disabled={busy || !canCreate}>
            {busy ? "Working…" : "Create user"}
          </Button>
        </form>
      </Panel>
    </div>
  );
}
