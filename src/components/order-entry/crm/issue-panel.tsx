"use client";

// The issue list for one follow-up, plus the "raise issue" form. Both live
// here because updating an existing issue and creating a new one share the
// same vocabulary (severity/status/resolution) and it keeps the page.tsx
// server component to a single client island for this section.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SeverityPill } from "./pill";
import {
  DEFAULT_ISSUE_CATEGORIES,
  ISSUE_RESOLUTIONS,
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  OWNER_DEPTS,
  categoryLabel,
  type IssueResolution,
  type IssueSeverity,
  type IssueStatus,
  type OwnerDept,
} from "@/lib/order-entry/crm";
import { formatNumber } from "@/lib/order-entry/orders";

const selectCls =
  "h-8 w-full rounded-lg border border-border bg-surface-2 px-2 text-[13px] text-text-1 outline-none focus-visible:border-ring";
const labelCls = "mb-1 block text-[11px] uppercase tracking-[0.04em] text-text-3";

export type FollowupLine = {
  id: string;
  quality: string;
  designNo: string;
  qtyMtr: string;
  isCancelled: boolean;
};

export type FollowupIssue = {
  id: string;
  quality: string | null;
  designNo: string | null;
  category: string;
  severity: string;
  qtyAffected: string | null;
  description: string | null;
  ownerDept: string | null;
  status: string;
  resolution: string | null;
  resolutionNote: string | null;
};

const RESOLUTION_LABEL: Record<IssueResolution, string> = {
  CREDIT_NOTE: "Credit note",
  REPLACEMENT: "Replacement",
  REPRINT: "Reprint",
  DISCOUNT: "Discount",
  EXPLAINED: "Explained",
  NO_ACTION: "No action",
};

const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
};

function IssueItem({ issue, canEdit }: { issue: FollowupIssue; canEdit: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [status, setStatus] = useState<IssueStatus>(issue.status as IssueStatus);
  const [resolution, setResolution] = useState<IssueResolution | null>(
    (issue.resolution as IssueResolution | null) ?? null,
  );
  const [resolutionNote, setResolutionNote] = useState(issue.resolutionNote ?? "");

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/crm/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          resolution,
          resolution_note: resolutionNote.trim() || null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Could not save the issue");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityPill severity={issue.severity as IssueSeverity} />
        <strong className="text-text-1">{categoryLabel(issue.category)}</strong>
        <span className="ml-auto rounded-full bg-chip px-2 py-[3px] text-[11px] font-medium text-text-3">
          {ISSUE_STATUS_LABEL[issue.status as IssueStatus] ?? issue.status}
        </span>
      </div>
      <div className="mt-1 text-[12px] text-text-3">
        {issue.quality ? (
          <>
            {issue.quality} · <span className="font-mono">{issue.designNo}</span>
          </>
        ) : (
          "Whole order"
        )}
        {issue.qtyAffected ? ` — ${formatNumber(Number(issue.qtyAffected))} m` : ""}
        {issue.ownerDept ? ` · ${issue.ownerDept}` : ""}
      </div>
      {issue.description && (
        <p className="mt-1.5 text-[12.5px] text-text-2">{issue.description}</p>
      )}
      {issue.resolution && (
        <p className="mt-1.5 text-[12px] text-text-3">
          Resolved:{" "}
          {RESOLUTION_LABEL[issue.resolution as IssueResolution] ?? issue.resolution}
          {issue.resolutionNote ? ` — ${issue.resolutionNote}` : ""}
        </p>
      )}

      {canEdit && (
        <div className="mt-2.5 border-t border-border pt-2.5">
          {editing ? (
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Status</label>
                  <select
                    className={selectCls}
                    value={status}
                    onChange={(e) => setStatus(e.target.value as IssueStatus)}
                  >
                    {ISSUE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {ISSUE_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
                {(status === "RESOLVED" || status === "REJECTED") && (
                  <div>
                    <label className={labelCls}>Resolution</label>
                    <select
                      className={selectCls}
                      value={resolution ?? ""}
                      onChange={(e) =>
                        setResolution((e.target.value || null) as IssueResolution | null)
                      }
                    >
                      <option value="">—</option>
                      {ISSUE_RESOLUTIONS.map((r) => (
                        <option key={r} value={r}>
                          {RESOLUTION_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <Input
                placeholder="Resolution note (optional)"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                className="text-[13px]"
              />
              {error && <p className="text-[12px] text-status-red">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={isPending}
                  title={
                    status === "RESOLVED" && !resolution
                      ? "A resolution is required to resolve an issue"
                      : "Save"
                  }
                  onClick={save}
                >
                  {isPending ? "Saving…" : "Update"}
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[12px] font-medium text-accent-text hover:underline"
            >
              Update status / resolution
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function IssuePanel({
  followupId,
  lines,
  issues,
  canEdit,
}: {
  followupId: string;
  lines: FollowupLine[];
  issues: FollowupIssue[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [lineId, setLineId] = useState("");
  const [category, setCategory] = useState<string>(DEFAULT_ISSUE_CATEGORIES[0]);
  const [severity, setSeverity] = useState<IssueSeverity>("MEDIUM");
  const [dept, setDept] = useState<OwnerDept | "">("");
  const [qty, setQty] = useState("");
  const [desc, setDesc] = useState("");

  function reset() {
    setLineId("");
    setCategory(DEFAULT_ISSUE_CATEGORIES[0]);
    setSeverity("MEDIUM");
    setDept("");
    setQty("");
    setDesc("");
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/crm/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          followup_id: followupId,
          order_line_item_id: lineId || null,
          category: category.trim(),
          severity,
          owner_dept: dept || null,
          qty_affected: qty.trim() === "" ? null : Number(qty),
          description: desc.trim() || null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Could not raise the issue");
        return;
      }
      reset();
      setAdding(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {issues.length === 0 ? (
        <p className="text-[13px] text-text-3">No issues raised for this follow-up.</p>
      ) : (
        issues.map((issue) => <IssueItem key={issue.id} issue={issue} canEdit={canEdit} />)
      )}

      {canEdit &&
        (adding ? (
          <div className="rounded-lg border border-border bg-surface-2/60 p-3.5">
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-3">
              New issue
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>What went wrong</label>
                <Input
                  list="issue-categories"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="text-[13px]"
                />
                <datalist id="issue-categories">
                  {DEFAULT_ISSUE_CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className={labelCls}>Which design</label>
                <select
                  className={selectCls}
                  value={lineId}
                  onChange={(e) => setLineId(e.target.value)}
                >
                  <option value="">Whole order (no design)</option>
                  {lines
                    .filter((l) => !l.isCancelled)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.quality} · {l.designNo}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Severity</label>
                <select
                  className={selectCls}
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as IssueSeverity)}
                >
                  {ISSUE_SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0) + s.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Whose to fix</label>
                <select
                  className={selectCls}
                  value={dept}
                  onChange={(e) => setDept(e.target.value as OwnerDept | "")}
                >
                  <option value="">Unassigned</option>
                  {OWNER_DEPTS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Meters affected</label>
                <Input
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  inputMode="decimal"
                  placeholder="optional"
                  className="text-[13px]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>What happened</label>
                <Input
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="optional"
                  className="text-[13px]"
                />
              </div>
            </div>
            {error && <p className="mt-2 text-[12px] text-status-red">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  reset();
                }}
              >
                Cancel
              </Button>
              <Button size="sm" disabled={isPending || !category.trim()} onClick={submit}>
                {isPending ? "Adding…" : "Add issue"}
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-full cursor-pointer rounded-lg border border-dashed border-border py-2 text-[12.5px] font-medium text-text-3 transition-colors hover:border-primary hover:text-text-1"
          >
            + Add {issues.length > 0 ? "another " : ""}issue
          </button>
        ))}
    </div>
  );
}
