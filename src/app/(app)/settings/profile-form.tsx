"use client";

import { useState, useTransition } from "react";
import { IconKey, IconUser } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changeOwnPassword, removeOwnPassword, updateOwnName } from "./actions";

const MIN = 10;

/**
 * Your own account, as two cards: who you are, and how you sign in.
 *
 * Split because they are two different decisions with two different
 * consequences, and a single Save that quietly did both is how somebody
 * changes their password while meaning to fix a typo in their name.
 */
export function ProfileForm({
  name: initialName,
  email,
  hasPassword,
  role,
}: {
  name: string;
  email: string;
  hasPassword: boolean;
  role: "member" | "admin";
}) {
  const [name, setName] = useState(initialName);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(
    null,
  );
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<void>, ok: string) => {
    setMsg(null);
    start(async () => {
      try {
        await fn();
        setCurrent("");
        setNext("");
        setMsg({ tone: "ok", text: ok });
      } catch (e) {
        setMsg({
          tone: "bad",
          text: e instanceof Error ? e.message : "That didn't work.",
        });
      }
    });
  };

  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      {/* ── who you are ──────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-accent text-accent-text ring-1 ring-accent-text/15 ring-inset">
            <IconUser className="size-4" />
          </span>
          <h2 className="text-[14.5px] font-bold text-text-1">Your details</h2>
        </div>

        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-text-2">Name</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-text-2">Email</span>
            {/* Not editable here. It is the identity Google signs you in with
                and the key every module looks you up by — changing it is an
                admin action with consequences in three schemas. */}
            <Input value={email} disabled className="h-9" />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            className="h-9"
            disabled={pending || !name.trim() || name === initialName}
            onClick={() => run(() => updateOwnName(name), "Name saved.")}
          >
            Save name
          </Button>
          <span className="text-[12px] text-text-3">
            You are {role === "admin" ? "an ERP administrator" : "a member"}.
            {role === "admin"
              ? " You can manage people, access and systems."
              : " Ask an administrator if you need access to something."}
          </span>
        </div>
      </section>

      {/* ── how you sign in ──────────────────────────────────────────── */}
      <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-accent text-accent-text ring-1 ring-accent-text/15 ring-inset">
            <IconKey className="size-4" />
          </span>
          <h2 className="text-[14.5px] font-bold text-text-1">
            How you sign in
          </h2>
          <span className="ml-auto rounded-pill bg-chip px-2 py-0.5 text-[11px] font-semibold text-text-2 uppercase">
            {hasPassword ? "Google or password" : "Google only"}
          </span>
        </div>

        <p className="text-[13px] text-text-3">
          {hasPassword
            ? "You can sign in with Google or with your email and password."
            : "You currently sign in with Google only. Add a password and you can use either — useful if Google is ever unavailable."}
        </p>

        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          {hasPassword ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-text-2">
                Current password
              </span>
              <Input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="h-9"
              />
            </label>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-text-2">
              {hasPassword ? "New password" : "Password"}
            </span>
            <Input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder={`At least ${MIN} characters`}
              className="h-9"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            className="h-9"
            disabled={
              pending ||
              next.trim().length < MIN ||
              (hasPassword && current.length === 0)
            }
            onClick={() =>
              run(
                () => changeOwnPassword(current, next),
                hasPassword ? "Password changed." : "Password set.",
              )
            }
          >
            {hasPassword ? "Change password" : "Set password"}
          </Button>

          {hasPassword ? (
            <button
              type="button"
              disabled={pending || current.length === 0}
              onClick={() =>
                run(
                  () => removeOwnPassword(current),
                  "Password removed. You sign in with Google now.",
                )
              }
              className="text-[12.5px] text-status-red underline underline-offset-2 disabled:opacity-40"
            >
              Remove my password
            </button>
          ) : null}
        </div>

        {hasPassword ? (
          <p className="text-[11.5px] text-text-3">
            Removing it needs your current password too — otherwise a session
            left open on a shared phone would be enough to take away somebody
            else&apos;s second way in.
          </p>
        ) : null}

        {msg ? (
          <p
            role={msg.tone === "bad" ? "alert" : "status"}
            className={
              msg.tone === "bad"
                ? "rounded-field border border-status-red/30 bg-status-red-dim px-3 py-2 text-[12.5px] text-status-red"
                : "rounded-field border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text-2"
            }
          >
            {msg.text}
          </p>
        ) : null}
      </section>
    </div>
  );
}
