"use client";

// Settings → Design Database. The browsable log of every (order, fabric,
// design) combination the order form has ever autocompleted from, 25 per page,
// with search, an optional exact-fabric filter, single delete and checkbox
// bulk delete. Port of Order Entry's components/settings/design-db.tsx on
// plain fetch + component state.
import { useCallback, useEffect, useState } from "react";
import { IconDatabaseOff, IconSearch, IconTrash } from "@tabler/icons-react";
import { formatDateTime } from "@/lib/order-entry/orders";
import { Button } from "@/components/ui/button";
import { Pager } from "@/components/ui/pager";
import {
  CHECKBOX_CLS,
  EmptyRow,
  ErrorBanner,
  INPUT_CLS,
  LoadingRow,
  NoticeBanner,
  PANEL_CLS,
  TD_CLS,
  TH_CLS,
  apiJson,
} from "./settings-ui";
import { cn } from "@/lib/utils";

type DesignRow = {
  id: string;
  created_at: string;
  order_no: string;
  fabric_name: string;
  design_no: string;
};

type DesignList = {
  designs: DesignRow[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export function DesignDatabasePanel() {
  // `searchInput`/`fabricInput` are what's typed; `search`/`fabric` are what's
  // actually queried (only on submit), so typing never re-fetches.
  const [searchInput, setSearchInput] = useState("");
  const [fabricInput, setFabricInput] = useState("");
  const [search, setSearch] = useState("");
  const [fabric, setFabric] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<DesignList | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // Two-step confirms live in the row and in the bulk bar itself — no dialog
  // (§6.1's rule, applied here too). Deletion is permanent: this table is a
  // log, not a lifecycle, so removing a row only removes a suggestion.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // A re-fetch invalidates any pending row confirm: the row it pointed at
    // may not even be on this page any more.
    setConfirmId(null);
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (fabric) qs.set("fabric", fabric);
    qs.set("page", String(page));
    const res = await apiJson<DesignList>(
      `/api/order-entry/design-database?${qs.toString()}`,
    );
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setData(res.data);
    // Drop selections for rows that are no longer on screen.
    const visible = new Set(res.data.designs.map((d) => d.id));
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [search, fabric, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = data?.designs ?? [];
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggle(id: string) {
    // Any change to the selection retracts the bulk confirm — otherwise the
    // bar would still read "Delete permanently?" over a different selection.
    setConfirmBulk(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setConfirmBulk(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function submitSearch() {
    setPage(1);
    setNotice(null);
    setSearch(searchInput.trim());
    setFabric(fabricInput.trim());
  }

  async function deleteRow(r: DesignRow) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await apiJson(`/api/order-entry/design-database/${r.id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setConfirmId(null);
    setNotice(`Deleted ${r.fabric_name} · ${r.design_no}.`);
    // Stepping back a page when the last row of a page goes away keeps the
    // list from showing an empty final page.
    if (rows.length === 1 && page > 1) setPage(page - 1);
    else await load();
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await apiJson<{ deleted: number }>(
      "/api/order-entry/design-database/bulk-delete",
      { method: "POST", body: { ids } },
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setConfirmBulk(false);
    setSelected(new Set());
    setNotice(
      `Deleted ${res.data.deleted} design${res.data.deleted === 1 ? "" : "s"}.`,
    );
    if (rows.length === ids.length && page > 1) setPage(page - 1);
    else await load();
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end gap-2.5">
        <form
          className="flex flex-1 flex-wrap items-center gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch();
          }}
        >
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
            <IconSearch className="size-4 shrink-0 text-text-3" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Order no, fabric, design no…"
              className="w-full bg-transparent text-[13px] text-text-1 placeholder:text-text-3 focus:outline-none"
            />
          </div>
          <input
            value={fabricInput}
            onChange={(e) => setFabricInput(e.target.value)}
            placeholder="Exact fabric (optional)"
            className={cn(INPUT_CLS, "w-[200px]")}
          />
          <Button type="submit" size="lg" variant="outline">
            Search
          </Button>
          {(search || fabric) && (
            <button
              type="button"
              className="text-[12px] font-medium text-text-3 hover:text-text-1"
              onClick={() => {
                setSearchInput("");
                setFabricInput("");
                setSearch("");
                setFabric("");
                setPage(1);
              }}
            >
              Clear
            </button>
          )}
        </form>
        <Button size="lg" variant="outline" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <ErrorBanner message={error} />
      <NoticeBanner message={notice} />

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12.5px]">
          <span className="font-semibold text-text-1">
            {selected.size} selected
          </span>
          {confirmBulk ? (
            // The bar becomes the confirmation — no dialog.
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-status-red">Delete permanently?</span>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => void deleteSelected()}
              >
                {busy ? "Deleting…" : `Delete ${selected.size}`}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmBulk(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => setConfirmBulk(true)}
              >
                <IconTrash /> Delete selected
              </Button>
            </div>
          )}
        </div>
      )}

      <div className={PANEL_CLS}>
        {loading && !data ? (
          <LoadingRow />
        ) : rows.length === 0 ? (
          <EmptyRow
            icon={IconDatabaseOff}
            title="No designs found"
            description={
              search || fabric
                ? "Nothing matches this search — try clearing it."
                : "Designs are logged here automatically as orders are entered."
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className={cn(TH_CLS, "w-10")}>
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        className={CHECKBOX_CLS}
                        checked={allOnPageSelected}
                        onChange={toggleAll}
                      />
                    </th>
                    <th className={TH_CLS}>Logged</th>
                    <th className={TH_CLS}>Order no</th>
                    <th className={TH_CLS}>Fabric</th>
                    <th className={TH_CLS}>Design no</th>
                    <th className={cn(TH_CLS, "text-right")}>Actions</th>
                  </tr>
                </thead>
                <tbody className="[&>tr:last-child>td]:border-b-0">
                  {rows.map((r) => {
                    const checked = selected.has(r.id);
                    return (
                      <tr
                        key={r.id}
                        className={cn(
                          "hover:bg-surface-2",
                          checked && "bg-accent/60",
                        )}
                      >
                        <td className={TD_CLS}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${r.design_no}`}
                            className={CHECKBOX_CLS}
                            checked={checked}
                            onChange={() => toggle(r.id)}
                          />
                        </td>
                        <td className={cn(TD_CLS, "num whitespace-nowrap")}>
                          {formatDateTime(r.created_at)}
                        </td>
                        <td className={cn(TD_CLS, "num font-semibold text-accent-text")}>
                          {r.order_no}
                        </td>
                        <td className={cn(TD_CLS, "text-text-1")}>{r.fabric_name}</td>
                        <td className={cn(TD_CLS, "num")}>{r.design_no}</td>
                        <td className={cn(TD_CLS, "text-right")}>
                          {confirmId === r.id ? (
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              <span className="text-[12px] whitespace-nowrap text-status-red">
                                Delete permanently?
                              </span>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={busy}
                                onClick={() => void deleteRow(r)}
                              >
                                {busy ? "Deleting…" : "Delete"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label="Delete design row"
                              title="Delete this log row"
                              className="text-status-red hover:bg-status-red-dim hover:text-status-red"
                              disabled={busy}
                              onClick={() => setConfirmId(r.id)}
                            >
                              <IconTrash />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {data && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3.5 py-3">
                <p className="text-[12px] text-text-3">
                  <span className="num">{data.total}</span> design
                  {data.total === 1 ? "" : "s"} logged
                </p>
                {data.total_pages > 1 && (
                  <Pager
                    page={data.page}
                    totalPages={data.total_pages}
                    disabled={loading || busy}
                    onPageChange={setPage}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
