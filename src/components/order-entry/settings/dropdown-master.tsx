"use client";

// Settings → Dropdown Master. The six order-form autocomplete lists (party,
// fabric, agent, transport, haste, sales person) with add / inline-edit /
// deactivate / reactivate / hard-delete, bulk selection, and a paste-import
// panel. A port of Order Entry's components/settings/dropdown-master.tsx,
// rebuilt on plain fetch + component state (no TanStack Query / sonner in this
// shell) and restyled against docs/DESIGN.md.
//
// The CRM_* categories in LOOKUP_CATEGORIES are deliberately NOT listed here —
// they belong to the separately-scoped CRM settings tab.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  IconCheck,
  IconListSearch,
  IconPencil,
  IconRotateClockwise,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  CHECKBOX_CLS,
  ConfirmDialog,
  EmptyRow,
  ErrorBanner,
  INPUT_CLS,
  LoadingRow,
  NoticeBanner,
  Panel,
  Pill,
  apiJson,
} from "./settings-ui";
import { cn } from "@/lib/utils";

type LookupRow = {
  id: string;
  category: string;
  value: string;
  is_active: boolean;
  /** CRR customer this spelling resolves to, or null if CRR has no such customer. */
  crr_customer_id: number | null;
};

const CATEGORIES = [
  { key: "PARTY", label: "Party" },
  { key: "FABRIC", label: "Fabric" },
  { key: "AGENT", label: "Agent" },
  { key: "TRANSPORT", label: "Transport" },
  { key: "HASTE", label: "Haste" },
  { key: "SALES_PERSON", label: "Sales person" },
] as const;

// Party and Haste are both company names, so both are matched against the CRR
// customer master. The other categories are not customers and never link.
const CRR_LINKED = new Set<string>(["PARTY", "HASTE"]);

type Confirm =
  | { kind: "one"; id: string; label: string }
  | { kind: "bulk"; ids: string[] };

export function DropdownMaster() {
  const [category, setCategory] = useState<string>("PARTY");
  const [rows, setRows] = useState<LookupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [newValue, setNewValue] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [bulkText, setBulkText] = useState("");

  const categoryLabel =
    CATEGORIES.find((c) => c.key === category)?.label ?? category;

  const load = useCallback(async (cat: string) => {
    setLoading(true);
    const res = await apiJson<LookupRow[]>(
      `/api/order-entry/lookups?category=${encodeURIComponent(cat)}&all=1`,
    );
    setLoading(false);
    if (!res.ok) {
      setLoadError(res.error);
      setRows([]);
      return;
    }
    setLoadError(null);
    setRows(res.data ?? []);
  }, []);

  useEffect(() => {
    void load(category);
  }, [category, load]);

  function switchCategory(next: string) {
    setCategory(next);
    setSearch("");
    setEditId(null);
    setSelected(new Set());
    setConfirm(null);
    setError(null);
    setNotice(null);
  }

  // Runs a write, then reloads. `message` is shown as a transient notice.
  const run = useCallback(
    async (
      fn: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>,
      message?: string,
    ) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      const res = await fn();
      if (!res.ok) {
        setBusy(false);
        setError(res.error);
        return false;
      }
      await load(category);
      setBusy(false);
      if (message) setNotice(message);
      return true;
    },
    [category, load],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.value.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  // Selection is scoped to the rows the filter is actually showing, so the
  // action bar's count never refers to something hidden.
  const visibleSelectedIds = visible.filter((r) => selected.has(r.id)).map((r) => r.id);
  const selectedCount = visibleSelectedIds.length;
  const allVisibleSelected = visible.length > 0 && selectedCount === visible.length;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((r) => next.delete(r.id));
      else visible.forEach((r) => next.add(r.id));
      return next;
    });
  }

  async function addValue() {
    const value = newValue.trim();
    if (!value) return;
    const ok = await run(
      () =>
        apiJson("/api/order-entry/lookups", {
          method: "POST",
          body: { category, value },
        }),
      `Added “${value}”.`,
    );
    if (ok) setNewValue("");
  }

  async function saveEdit(id: string) {
    const value = editValue.trim();
    if (!value) return;
    const ok = await run(
      () =>
        apiJson(`/api/order-entry/lookups/${id}`, {
          method: "PATCH",
          body: { value },
        }),
      "Value renamed.",
    );
    if (ok) setEditId(null);
  }

  function setActive(id: string, active: boolean) {
    void run(
      () =>
        active
          ? apiJson(`/api/order-entry/lookups/${id}`, {
              method: "PATCH",
              body: { is_active: true },
            })
          : apiJson(`/api/order-entry/lookups/${id}`, { method: "DELETE" }),
      active ? "Value reactivated." : "Value deactivated — hidden from dropdowns.",
    );
  }

  function bulkDeactivate() {
    if (visibleSelectedIds.length === 0) return;
    void run(
      () =>
        apiJson("/api/order-entry/lookups/bulk", {
          method: "DELETE",
          body: { ids: visibleSelectedIds, hard: false },
        }),
      `${visibleSelectedIds.length} value${visibleSelectedIds.length === 1 ? "" : "s"} deactivated.`,
    ).then((ok) => {
      if (ok) setSelected(new Set());
    });
  }

  async function runConfirm() {
    if (!confirm) return;
    if (confirm.kind === "one") {
      const ok = await run(
        () =>
          apiJson(`/api/order-entry/lookups/${confirm.id}?hard=1`, {
            method: "DELETE",
          }),
        `Deleted “${confirm.label}” permanently.`,
      );
      if (ok) setConfirm(null);
      return;
    }
    const n = confirm.ids.length;
    const ok = await run(
      () =>
        apiJson("/api/order-entry/lookups/bulk", {
          method: "DELETE",
          body: { ids: confirm.ids, hard: true },
        }),
      `${n} value${n === 1 ? "" : "s"} deleted permanently.`,
    );
    if (ok) {
      setConfirm(null);
      setSelected(new Set());
    }
  }

  async function importBulk() {
    const values = bulkText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (values.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await apiJson<{
      added: number;
      reactivated: number;
      skipped: number;
      total: number;
    }>("/api/order-entry/lookups/bulk", {
      method: "POST",
      body: { category, values },
    });
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    await load(category);
    setBusy(false);
    setBulkText("");
    setNotice(
      `Imported into ${categoryLabel}: ${res.data.added} added, ${res.data.reactivated} reactivated, ${res.data.skipped} skipped.`,
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px] lg:items-start">
      <Panel
        title="Dropdown Master"
        description="The values that fill the order form's autocomplete lists."
        bodyClassName="flex flex-col gap-3.5"
      >
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => switchCategory(c.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                category === c.key
                  ? "border-accent-text/30 bg-accent text-accent-text"
                  : "border-border bg-surface-2 text-text-3 hover:text-text-1",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void addValue();
          }}
        >
          <input
            className={INPUT_CLS}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder={`Add a ${categoryLabel.toLowerCase()}…`}
          />
          <Button type="submit" size="lg" disabled={busy || !newValue.trim()}>
            Add
          </Button>
        </form>

        {CRR_LINKED.has(category) && (
          <p className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[12px] leading-relaxed text-text-3">
            <span className="font-semibold text-text-2">
              Customer names are shared with CRR.
            </span>{" "}
            <Pill tone="green">In CRR</Pill> means this exact company already
            exists in the CRR customer master, so orders using it are attributed
            automatically. <Pill>not in CRR</Pill> just means CRR has no account
            under that name yet — the order still saves normally, someone
            matches it up once. Nothing here needs correcting.
          </p>
        )}

        <input
          className={INPUT_CLS}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Filter ${categoryLabel.toLowerCase()} values…`}
        />

        <ErrorBanner message={error ?? loadError} />
        <NoticeBanner message={notice} />

        {visible.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12.5px]">
            <label className="flex cursor-pointer items-center gap-2 text-text-2">
              <input
                type="checkbox"
                className={CHECKBOX_CLS}
                checked={allVisibleSelected}
                ref={(el) => {
                  if (el) {
                    el.indeterminate = selectedCount > 0 && !allVisibleSelected;
                  }
                }}
                onChange={toggleAllVisible}
              />
              {selectedCount > 0 ? `${selectedCount} selected` : "Select all"}
            </label>
            {selectedCount > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  title="Deactivate selected (hide from dropdowns)"
                  onClick={bulkDeactivate}
                >
                  Deactivate
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => setConfirm({ kind: "bulk", ids: visibleSelectedIds })}
                >
                  <IconTrash /> Delete
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-border">
          {loading ? (
            <LoadingRow />
          ) : visible.length === 0 ? (
            <EmptyRow
              icon={IconListSearch}
              title={search ? "Nothing matches this filter" : "No values yet"}
              description={
                search
                  ? "Clear the filter to see the whole list."
                  : `Add the first ${categoryLabel.toLowerCase()} above, or paste a list on the right.`
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((r) => (
                <li
                  key={r.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-[13px]",
                    selected.has(r.id) && "bg-accent/60",
                  )}
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.value}`}
                    className={CHECKBOX_CLS}
                    checked={selected.has(r.id)}
                    onChange={() => toggleOne(r.id)}
                  />
                  {editId === r.id ? (
                    <>
                      <input
                        className={cn(INPUT_CLS, "h-8")}
                        value={editValue}
                        autoFocus
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveEdit(r.id);
                          if (e.key === "Escape") setEditId(null);
                        }}
                      />
                      <Button
                        size="icon-sm"
                        aria-label="Save"
                        disabled={busy || !editValue.trim()}
                        onClick={() => void saveEdit(r.id)}
                      >
                        <IconCheck />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Cancel"
                        onClick={() => setEditId(null)}
                      >
                        <IconX />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span
                        className={cn(
                          "flex-1 truncate",
                          r.is_active
                            ? "text-text-1"
                            : "text-text-3 line-through",
                        )}
                      >
                        {r.value}
                      </span>
                      {CRR_LINKED.has(category) &&
                        (r.crr_customer_id != null ? (
                          <Pill
                            tone="green"
                            title={`Matches CRR customer #${r.crr_customer_id}. Orders are attributed automatically.`}
                          >
                            In CRR
                          </Pill>
                        ) : (
                          <Pill title="No customer with this name in the CRR master yet — normal for a new customer.">
                            not in CRR
                          </Pill>
                        ))}
                      {!r.is_active && <Pill tone="amber">Inactive</Pill>}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Edit value"
                        title="Rename"
                        disabled={busy}
                        onClick={() => {
                          setEditId(r.id);
                          setEditValue(r.value);
                        }}
                      >
                        <IconPencil />
                      </Button>
                      {r.is_active ? (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Deactivate"
                          title="Deactivate (hide from dropdowns)"
                          disabled={busy}
                          onClick={() => setActive(r.id, false)}
                        >
                          <IconX />
                        </Button>
                      ) : (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Reactivate"
                          title="Reactivate"
                          disabled={busy}
                          onClick={() => setActive(r.id, true)}
                        >
                          <IconRotateClockwise />
                        </Button>
                      )}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Delete permanently"
                        title="Delete permanently"
                        className="text-status-red hover:bg-status-red-dim hover:text-status-red"
                        disabled={busy}
                        onClick={() =>
                          setConfirm({ kind: "one", id: r.id, label: r.value })
                        }
                      >
                        <IconTrash />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <Panel
        title="Bulk paste"
        description={`One value per line, imported into ${categoryLabel}.`}
        bodyClassName="flex flex-col gap-3"
      >
        <p className="text-[12px] leading-relaxed text-text-3">
          Duplicates are skipped automatically, and values that were deactivated
          earlier are reactivated instead of being added twice.
        </p>
        <textarea
          rows={10}
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder={"Value one\nValue two\nValue three"}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-text-1 outline-none transition-colors placeholder:text-text-3 focus-visible:border-border-strong"
        />
        <Button
          size="lg"
          disabled={busy || !bulkText.trim()}
          onClick={() => void importBulk()}
        >
          {busy ? "Working…" : "Import values"}
        </Button>
      </Panel>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        busy={busy}
        busyLabel="Deleting…"
        title="Delete permanently?"
        description={
          confirm?.kind === "one" ? (
            <>
              Permanently delete{" "}
              <span className="font-semibold text-text-1">
                “{confirm.label}”
              </span>{" "}
              from {categoryLabel}? Existing orders keep the text they were
              saved with, but the value disappears from the dropdown for good.
            </>
          ) : (
            <>
              Permanently delete{" "}
              <span className="font-semibold text-text-1">
                {confirm?.kind === "bulk" ? confirm.ids.length : 0} value
                {confirm?.kind === "bulk" && confirm.ids.length === 1 ? "" : "s"}
              </span>{" "}
              from {categoryLabel}? This cannot be undone — use Deactivate if you
              only want them hidden.
            </>
          )
        }
        onConfirm={() => void runConfirm()}
      />
    </div>
  );
}
