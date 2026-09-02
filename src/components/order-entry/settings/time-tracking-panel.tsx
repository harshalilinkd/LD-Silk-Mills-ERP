"use client";

// Settings → Time tracking. The 7 workflow stages and their SLA offset (days
// from the order date). Editing an offset changes the planned date NEW orders
// get; "Recompute planned dates" pushes the current config onto every
// not-yet-done stage of existing orders, which is why it sits behind a confirm
// dialog. Port of Order Entry's components/settings/time-tracking.tsx.
import { useCallback, useEffect, useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  ConfirmDialog,
  ErrorBanner,
  INPUT_CLS,
  LoadingRow,
  NoticeBanner,
  Panel,
  apiJson,
} from "./settings-ui";
import { cn } from "@/lib/utils";

type Stage = {
  stage_key: string;
  label: string;
  sort_order: number;
  planned_offset_days: number;
};

// What an order dated today would get as its planned date for `offsetDays`.
function previewDate(offsetDays: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(d);
}

export function TimeTrackingPanel() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmRecompute, setConfirmRecompute] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiJson<Stage[]>("/api/order-entry/stages");
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setStages(res.data);
    setDraft(
      Object.fromEntries(
        res.data.map((s) => [s.stage_key, String(s.planned_offset_days)]),
      ),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function isChanged(s: Stage): boolean {
    const v = draft[s.stage_key];
    return v !== undefined && v.trim() !== "" && Number(v) !== s.planned_offset_days;
  }

  const changed = stages.filter(isChanged);

  async function saveStage(s: Stage) {
    const raw = draft[s.stage_key];
    const value = Number(raw);
    if (raw === undefined || raw.trim() === "" || !Number.isFinite(value)) {
      setError(`${s.label}: enter a whole number of days.`);
      return false;
    }
    setSavingKey(s.stage_key);
    setError(null);
    setNotice(null);
    const res = await apiJson(`/api/order-entry/stages/${s.stage_key}`, {
      method: "PATCH",
      body: { planned_offset_days: value },
    });
    setSavingKey(null);
    if (!res.ok) {
      setError(`${s.label}: ${res.error}`);
      return false;
    }
    setStages((prev) =>
      prev.map((p) =>
        p.stage_key === s.stage_key ? { ...p, planned_offset_days: value } : p,
      ),
    );
    setNotice(`${s.label} saved — applies to new orders.`);
    return true;
  }

  async function saveAll() {
    setBusy(true);
    let okCount = 0;
    for (const s of changed) {
      // Sequential on purpose: each PATCH is tiny and a failure should stop
      // where it stopped rather than leave a half-applied burst of writes.
      const ok = await saveStage(s);
      if (!ok) break;
      okCount += 1;
    }
    setBusy(false);
    if (okCount > 0) {
      setNotice(
        `Saved ${okCount} stage${okCount === 1 ? "" : "s"} — applies to new orders. Use “Recompute planned dates” to apply to existing ones.`,
      );
    }
  }

  async function recompute() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await apiJson<{ recomputed: number }>(
      "/api/order-entry/stages/recompute",
      { method: "POST" },
    );
    setBusy(false);
    setConfirmRecompute(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNotice(
      `Recomputed planned dates for ${res.data.recomputed} open stage${res.data.recomputed === 1 ? "" : "s"}.`,
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px] lg:items-start">
      <Panel
        title="Time tracking (SLA)"
        description="Days from the order date each stage is planned for."
        action={
          <span className="text-[11px] text-text-3">days from order date</span>
        }
        bodyClassName="flex flex-col gap-3"
      >
        <ErrorBanner message={error} />
        <NoticeBanner message={notice} />

        {loading ? (
          <LoadingRow />
        ) : (
          <>
            {stages.map((s) => {
              const dirty = isChanged(s);
              return (
                <div
                  key={s.stage_key}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent font-mono text-[12px] text-accent-text">
                    {s.sort_order}
                  </span>
                  <span className="flex-1 truncate text-[13px] font-medium text-text-1">
                    {s.label}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    step={1}
                    aria-label={`${s.label} planned offset in days`}
                    className={cn(INPUT_CLS, "w-20 text-center font-mono")}
                    value={draft[s.stage_key] ?? ""}
                    onChange={(e) =>
                      setDraft((m) => ({ ...m, [s.stage_key]: e.target.value }))
                    }
                  />
                  <Button
                    size="sm"
                    variant={dirty ? "default" : "ghost"}
                    disabled={!dirty || busy || savingKey !== null}
                    onClick={() => void saveStage(s)}
                  >
                    {savingKey === s.stage_key ? "Saving…" : "Save"}
                  </Button>
                </div>
              );
            })}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <Button
                variant="outline"
                size="lg"
                disabled={busy || savingKey !== null}
                onClick={() => setConfirmRecompute(true)}
              >
                <IconRefresh /> Recompute planned dates
              </Button>
              <Button
                size="lg"
                disabled={busy || savingKey !== null || changed.length === 0}
                onClick={() => void saveAll()}
              >
                {busy
                  ? "Saving…"
                  : `Save all${changed.length ? ` (${changed.length})` : ""}`}
              </Button>
            </div>
          </>
        )}
      </Panel>

      <Panel
        title="Live preview"
        description="For an order dated today."
        bodyClassName="flex flex-col gap-2"
      >
        <ul className="flex flex-col gap-1.5">
          {stages.map((s) => {
            const raw = draft[s.stage_key];
            const off = Number(raw);
            const valid = raw !== undefined && raw.trim() !== "" && !Number.isNaN(off);
            return (
              <li
                key={s.stage_key}
                className="flex items-center justify-between gap-3 text-[13px]"
              >
                <span className="truncate text-text-3">{s.label}</span>
                <span className="shrink-0 font-mono font-medium text-text-1">
                  {valid ? previewDate(off) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11.5px] leading-relaxed text-text-3">
          Saved offsets apply to new orders. Use “Recompute planned dates” to
          push them onto the not-yet-done stages of existing orders too —
          completed stages are never touched.
        </p>
      </Panel>

      <ConfirmDialog
        open={confirmRecompute}
        onOpenChange={setConfirmRecompute}
        busy={busy}
        busyLabel="Recomputing…"
        destructive={false}
        confirmLabel="Recompute"
        title="Recompute planned dates?"
        description={
          <>
            This rewrites the planned date of{" "}
            <span className="font-semibold text-text-1">
              every not-yet-done stage on every existing order
            </span>{" "}
            using the offsets saved above. Completed stages keep their recorded
            dates. Save your offset changes first — recompute reads what is
            stored, not what is typed.
          </>
        }
        onConfirm={() => void recompute()}
      />
    </div>
  );
}
