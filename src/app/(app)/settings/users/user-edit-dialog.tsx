"use client";

import { useState, useTransition } from "react";
import { IconKey, IconPencil } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PublicUser } from "@/lib/queries";
import { clearUserPassword, setUserPassword, updateUser } from "./actions";

/** Mirrors PASSWORD_MIN in ./actions.ts — the server is the one that enforces it. */
const PASSWORD_MIN = 10;

/**
 * `PublicUser`, deliberately, not `User`.
 *
 * This is a Client Component, so every field of whatever it is given is
 * serialised into the HTML sent to the browser. It used to take the full row —
 * harmless until `password_hash` existed, at which point it would have shipped
 * every bcrypt hash in the page source. `PublicUser` is the column list from
 * `src/lib/queries.ts` and the hash is not in it; TypeScript now refuses the
 * full row here, which is the point.
 */
export function UserEditDialog({
  user,
  isSelf,
}: {
  user: PublicUser;
  /** Disables the two controls an admin must not turn on themselves. */
  isSelf: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user.name);
  const [status, setStatus] = useState<"active" | "inactive">(user.status);
  const [role, setRole] = useState<"member" | "admin">(user.role);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasPassword = user.passwordSetAt !== null;

  function reset() {
    setName(user.name);
    setStatus(user.status);
    setRole(user.role);
    setPassword("");
    setError(null);
    setNotice(null);
  }

  function run(fn: () => Promise<void>, onDone?: () => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await fn();
        onDone?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "That didn't work.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${user.name}`}
      >
        <IconPencil className="size-3.5" />
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-2" htmlFor="u-name">
              Name
            </label>
            <Input
              id="u-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-2" htmlFor="u-email">
              Email
            </label>
            <Input id="u-email" value={user.email} disabled />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-2">Status</label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as "active" | "inactive")}
                disabled={isSelf}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-2">
                ERP administrator
              </label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as "member" | "admin")}
                disabled={isSelf}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">No</SelectItem>
                  <SelectItem value="admin">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isSelf ? (
            <p className="text-[12px] text-text-3">
              You cannot deactivate your own account or remove your own
              administrator access — there would be no way back in.
            </p>
          ) : null}

          {/* ── password ────────────────────────────────────────────────
              Separate from Save on purpose: setting a password is its own
              decision with its own consequence, and burying it in a form that
              also renames somebody invites doing it by accident. */}
          <div className="flex flex-col gap-2 rounded-[10px] border border-border bg-surface-2 p-3">
            <div className="flex items-center gap-2">
              <IconKey className="size-4 text-text-3" />
              <span className="text-[13px] font-semibold text-text-1">
                Password sign-in
              </span>
              <span className="ml-auto text-[11.5px] text-text-3">
                {hasPassword ? "Set" : "Google only"}
              </span>
            </div>

            <p className="text-[12px] text-text-3">
              {hasPassword
                ? "They can sign in with this email and a password. Setting a new one replaces it immediately."
                : "They can only sign in with Google. Give them a password to add the other way in."}
            </p>

            <div className="flex gap-2">
              <Input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`At least ${PASSWORD_MIN} characters`}
                autoComplete="off"
                aria-label="New password"
              />
              <Button
                variant="outline"
                disabled={isPending || password.trim().length < PASSWORD_MIN}
                onClick={() =>
                  run(
                    () => setUserPassword(user.id, password),
                    () => {
                      setPassword("");
                      setNotice(
                        "Password set. Tell them in person — it is not shown again.",
                      );
                    },
                  )
                }
              >
                Set
              </Button>
            </div>

            {/* Shown as text, not dots: the admin has to read it out to
                somebody, and a masked field they cannot check is how a
                mistyped password becomes a locked-out colleague. */}
            <p className="text-[11.5px] text-text-3">
              Typed in the clear so you can read it back. It is stored
              scrambled and can never be shown again — only replaced.
            </p>

            {hasPassword && !isSelf ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run(
                    () => clearUserPassword(user.id),
                    () => setNotice("Password removed. Google sign-in only now."),
                  )
                }
                className="self-start text-[12px] text-status-red underline underline-offset-2 disabled:opacity-50"
              >
                Remove password
              </button>
            ) : null}
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-[8px] border border-status-red/30 bg-status-red-dim px-3 py-2 text-[12.5px] text-status-red"
            >
              {error}
            </p>
          ) : notice ? (
            <p
              role="status"
              className="rounded-[8px] border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text-2"
            >
              {notice}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button
            onClick={() =>
              run(
                () => updateUser(user.id, { name, status, role }),
                () => setOpen(false),
              )
            }
            disabled={isPending}
          >
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
