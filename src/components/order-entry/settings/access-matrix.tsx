"use client";

// Settings → Access — docs/SCREENS.md §6.6. The Role × Capability grant
// matrix, written straight through: EVERY CHECKBOX IS A `PUT /api/access` ON
// CHANGE. There is no save button and no local draft. A box that looks ticked
// is a grant that is stored; the two can never disagree, which is the point —
// a half-committed draft on a permissions screen is a security surface, not a
// convenience.
//
// The tick is applied optimistically and rolled back if the write fails, and
// only the cell being written is disabled — flipping one box must not freeze
// the other twenty while the round trip completes.
//
// ADMIN is shown but hard-coded: checked, readOnly, disabled. It is never
// stored and never editable, so an admin cannot lock themselves out.
//
// Roles and capabilities come from lib/order-entry/rbac.ts so the grid can't
// drift from what the guards actually check.
import { useCallback, useEffect, useState } from "react";
import { IconLock } from "@tabler/icons-react";
import {
  CAPABILITIES,
  EDITABLE_ROLES,
  type Capability,
  type Role,
} from "@/lib/order-entry/rbac";
import {
  CHECKBOX_CLS,
  ErrorBanner,
  LoadingRow,
  Panel,
  TD_CLS,
  TH_CLS,
  apiJson,
} from "./settings-ui";
import { cn } from "@/lib/utils";

type Grants = Record<string, Record<string, boolean>>;

const cellKey = (role: Role, capability: Capability) => `${role}:${capability}`;

export function AccessMatrix() {
  const [grants, setGrants] = useState<Grants | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Keys of the cells whose own PUT is in flight. Per-cell, not a single
  // global "busy" flag, so one slow write disables one checkbox.
  const [pending, setPending] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiJson<{ grants: Grants }>("/api/order-entry/access");
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setGrants(res.data.grants);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function markPending(key: string, on: boolean) {
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function setCell(role: Role, capability: Capability, allowed: boolean) {
    setGrants((prev) =>
      prev ? { ...prev, [role]: { ...prev[role], [capability]: allowed } } : prev,
    );
  }

  async function toggle(role: Role, capability: Capability, allowed: boolean) {
    const key = cellKey(role, capability);
    const before = grants?.[role]?.[capability] ?? false;
    setError(null);
    setCell(role, capability, allowed); // optimistic
    markPending(key, true);

    const res = await apiJson("/api/order-entry/access", {
      method: "PUT",
      body: { role, capability, allowed },
    });

    markPending(key, false);
    if (!res.ok) {
      setCell(role, capability, before); // roll the tick back
      const label = CAPABILITIES.find((c) => c.key === capability)?.label;
      setError(`${role} — ${label}: ${res.error}`);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Access — what each role can do"
        description="Tick a capability to grant it. Every tick saves immediately."
        bodyClassName="flex flex-col gap-3 px-0 py-0"
      >
        <div className="flex flex-col gap-2.5 px-[18px] pt-4 empty:hidden">
          <ErrorBanner message={error} />
        </div>

        {loading || !grants ? (
          <LoadingRow />
        ) : (
          <>
            {/* Desktop: the full Role × Capability matrix. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className={TH_CLS}>Role</th>
                    {CAPABILITIES.map((c) => (
                      <th
                        key={c.key}
                        title={c.hint}
                        className={cn(TH_CLS, "text-center")}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="[&>tr:last-child>td]:border-b-0">
                  {/* ADMIN — always full, never editable, never stored. */}
                  <tr>
                    <td className={TD_CLS}>
                      <div className="flex items-center gap-1.5 font-semibold text-text-1">
                        <IconLock className="size-3.5 text-text-3" />
                        ADMIN
                      </div>
                      <div className="text-[11.5px] text-text-3">
                        Always full access
                      </div>
                    </td>
                    {CAPABILITIES.map((c) => (
                      <td key={c.key} className={cn(TD_CLS, "text-center")}>
                        <input
                          type="checkbox"
                          checked
                          readOnly
                          disabled
                          aria-label={`ADMIN — ${c.label} (always on)`}
                          className={cn(CHECKBOX_CLS, "opacity-60")}
                        />
                      </td>
                    ))}
                  </tr>
                  {EDITABLE_ROLES.map((role) => (
                    <tr key={role} className="align-middle hover:bg-surface-2">
                      <td className={cn(TD_CLS, "font-semibold text-text-1")}>
                        {role}
                      </td>
                      {CAPABILITIES.map((c) => (
                        <td key={c.key} className={cn(TD_CLS, "p-0 text-center")}>
                          {/* The label wraps the whole cell so the tap target
                              is the cell, not the 17px box inside it. */}
                          <label className="flex cursor-pointer items-center justify-center p-2">
                            <input
                              type="checkbox"
                              checked={grants[role]?.[c.key] ?? false}
                              disabled={pending.has(cellKey(role, c.key))}
                              aria-label={`${role} — ${c.label}`}
                              className={CHECKBOX_CLS}
                              onChange={(e) =>
                                void toggle(role, c.key, e.target.checked)
                              }
                            />
                          </label>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: one section per role, capabilities as label/checkbox
                rows — the same data with no horizontal scroll. */}
            <div className="flex flex-col divide-y divide-border border-t border-border md:hidden">
              <div className="px-[18px] py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-text-1">
                    <IconLock className="size-3.5 text-text-3" />
                    ADMIN
                  </span>
                  <span className="text-[11.5px] text-text-3">
                    Always full access
                  </span>
                </div>
                <ul className="mt-1.5 flex flex-col">
                  {CAPABILITIES.map((c) => (
                    <li
                      key={c.key}
                      className="flex items-center justify-between gap-3 py-1.5"
                    >
                      <span className="text-[13px] text-text-2">{c.label}</span>
                      <input
                        type="checkbox"
                        checked
                        readOnly
                        disabled
                        aria-label={`ADMIN — ${c.label} (always on)`}
                        className={cn(CHECKBOX_CLS, "opacity-60")}
                      />
                    </li>
                  ))}
                </ul>
              </div>
              {EDITABLE_ROLES.map((role) => (
                <div key={role} className="px-[18px] py-3">
                  <span className="text-[13px] font-semibold text-text-1">
                    {role}
                  </span>
                  <ul className="mt-1.5 flex flex-col">
                    {CAPABILITIES.map((c) => (
                      <li key={c.key}>
                        <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5">
                          <span className="text-[13px] text-text-2">
                            {c.label}
                          </span>
                          <input
                            type="checkbox"
                            checked={grants[role]?.[c.key] ?? false}
                            disabled={pending.has(cellKey(role, c.key))}
                            aria-label={`${role} — ${c.label}`}
                            className={CHECKBOX_CLS}
                            onChange={(e) =>
                              void toggle(role, c.key, e.target.checked)
                            }
                          />
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}

        {/* The source app said "next sign-in" because it baked capabilities
            into the JWT at login. We do not: resolveOrderEntryAuthz() reads
            role_permissions live on every request, so a tick here applies to
            the very next thing the user does. Our wording is the accurate one
            for this app — do not "correct" it back to sign-in. */}
        <p className="border-t border-border px-[18px] py-3 text-[11.5px] text-text-3">
          Changes take effect on the user&apos;s next request. Settings and user
          management stay ADMIN-only and can&apos;t be granted here.
        </p>
      </Panel>

      <Panel title="What the capabilities mean">
        <ul className="grid gap-3 sm:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <li key={c.key} className="flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-text-1">
                {c.label}
              </span>
              <span className="text-[11.5px] text-text-3">{c.hint}</span>
              <span className="font-mono text-[11px] text-text-3">{c.key}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
