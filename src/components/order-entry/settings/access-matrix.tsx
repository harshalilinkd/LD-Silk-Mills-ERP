"use client";

// Settings → Access. The editable role × capability grant matrix. ADMIN is
// shown but locked (always full access, and the settings/user-management area
// is never grantable). Roles and capabilities come from
// lib/order-entry/rbac.ts so the grid can't drift from what the guards check.
//
// The API writes one (role, capability) pair per PUT, so Save walks only the
// cells that actually changed. Toggling is local until then, which lets an
// admin flip several boxes and review before committing.
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconLock } from "@tabler/icons-react";
import {
  CAPABILITIES,
  EDITABLE_ROLES,
  type Capability,
  type Role,
} from "@/lib/order-entry/rbac";
import { Button } from "@/components/ui/button";
import {
  CHECKBOX_CLS,
  ErrorBanner,
  LoadingRow,
  NoticeBanner,
  Panel,
  TD_CLS,
  TH_CLS,
  apiJson,
} from "./settings-ui";
import { cn } from "@/lib/utils";

type Grants = Record<string, Record<string, boolean>>;

function cloneGrants(g: Grants): Grants {
  return Object.fromEntries(
    Object.entries(g).map(([role, caps]) => [role, { ...caps }]),
  );
}

export function AccessMatrix() {
  const [saved, setSaved] = useState<Grants | null>(null);
  const [draft, setDraft] = useState<Grants | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiJson<{ grants: Grants }>("/api/order-entry/access");
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setSaved(res.data.grants);
    setDraft(cloneGrants(res.data.grants));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Every cell whose draft value differs from what the server last returned.
  const changes = useMemo(() => {
    if (!saved || !draft) return [];
    const out: { role: Role; capability: Capability; allowed: boolean }[] = [];
    for (const role of EDITABLE_ROLES) {
      for (const c of CAPABILITIES) {
        const next = draft[role]?.[c.key] ?? false;
        if (next !== (saved[role]?.[c.key] ?? false)) {
          out.push({ role, capability: c.key, allowed: next });
        }
      }
    }
    return out;
  }, [saved, draft]);

  function toggle(role: Role, capability: Capability, allowed: boolean) {
    setNotice(null);
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            [role]: { ...prev[role], [capability]: allowed },
          }
        : prev,
    );
  }

  async function save() {
    if (changes.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    for (const change of changes) {
      const res = await apiJson("/api/order-entry/access", {
        method: "PUT",
        body: change,
      });
      if (!res.ok) {
        setBusy(false);
        setError(
          `${change.role} — ${CAPABILITIES.find((c) => c.key === change.capability)?.label}: ${res.error}`,
        );
        // Re-read so the grid shows what actually landed rather than a
        // half-applied draft.
        await load();
        return;
      }
    }
    const n = changes.length;
    await load();
    setBusy(false);
    setNotice(
      `Saved ${n} change${n === 1 ? "" : "s"} — they take effect on the affected users' next request.`,
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Access — what each role can do"
        description="Tick a capability to grant it to that role."
        action={
          <div className="flex items-center gap-2">
            {changes.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setDraft(saved ? cloneGrants(saved) : null)}
              >
                Discard
              </Button>
            )}
            <Button
              size="sm"
              disabled={busy || changes.length === 0}
              onClick={() => void save()}
            >
              {busy
                ? "Saving…"
                : `Save${changes.length ? ` (${changes.length})` : ""}`}
            </Button>
          </div>
        }
        bodyClassName="flex flex-col gap-3 px-0 py-0"
      >
        <div className="flex flex-col gap-2.5 px-[18px] pt-4 empty:hidden">
          <ErrorBanner message={error} />
          <NoticeBanner message={notice} />
        </div>

        {loading || !draft ? (
          <LoadingRow />
        ) : (
          <div className="overflow-x-auto">
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
                {/* ADMIN — always full, never editable. */}
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
                    {CAPABILITIES.map((c) => {
                      const checked = draft[role]?.[c.key] ?? false;
                      const dirty =
                        checked !== (saved?.[role]?.[c.key] ?? false);
                      return (
                        <td
                          key={c.key}
                          className={cn(
                            TD_CLS,
                            "text-center",
                            dirty && "bg-accent/60",
                          )}
                        >
                          <label className="inline-flex cursor-pointer items-center justify-center p-1.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={busy}
                              aria-label={`${role} — ${c.label}`}
                              className={CHECKBOX_CLS}
                              onChange={(e) =>
                                toggle(role, c.key, e.target.checked)
                              }
                            />
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="border-t border-border px-[18px] py-3 text-[11.5px] text-text-3">
          Changes take effect on the affected users&apos; next request. Settings
          and user management stay ADMIN-only and can&apos;t be granted here.
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
