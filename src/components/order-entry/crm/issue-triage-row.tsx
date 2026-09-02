"use client";

// The inline triage control for one row of the Issues board
// (src/app/(app)/crm/issues/page.tsx). Complaints are only ever CREATED from
// the follow-up detail page — this component only lets someone with
// crm.edit narrow down what happened next: change status, and (when
// resolving) say how it was settled. Client because expand/collapse and the
// PATCH call both need state the server-rendered page can't hold.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ISSUE_RESOLUTIONS,
  ISSUE_STATUSES,
  categoryLabel,
  type IssueResolution,
  type IssueRow,
  type IssueStatus,
} from "@/lib/order-entry/crm";
import { formatDate, formatNumber } from "@/lib/order-entry/orders";
import { useOrderEntrySession } from "@/lib/order-entry/context";
import { hasCap } from "@/lib/order-entry/rbac";
import { Pill, SeverityPill } from "@/components/order-entry/crm/pill";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The department that has to ACT, not a vendor/owner in the CRR sense — the
// board would otherwise read "Owner: TRANSPORT" as if it named the carrier.
export const DEPT_LABEL: Record<string, string> = {
  OPS: "Operations",
  DISPATCH: "Dispatch",
  DESIGN: "Design",
  ACCOUNTS: "Accounts",
  TRANSPORT: "Transport",
  SALES: "Sales",
};

const STATUS_TONE = {
  OPEN: "due",
  IN_PROGRESS: "progress",
  RESOLVED: "done",
  REJECTED: "warn",
} as const;

const STATUS_TEXT: Record<IssueStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
};

const RESOLUTION_LABEL: Record<IssueResolution, string> = {
  CREDIT_NOTE: "Credit note",
  REPLACEMENT: "Replacement",
  REPRINT: "Reprint",
  DISCOUNT: "Discount",
  EXPLAINED: "Explained",
  NO_ACTION: "No action",
};

const fieldCls =
  "h-8 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] text-text-1 outline-none focus-visible:border-ring";

function money(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  return `₹${formatNumber(n)}`;
}

export function IssueTriageRow({ row }: { row: IssueRow }) {
  const router = useRouter();
  const { role, caps } = useOrderEntrySession();
  const canEdit = role === "ADMIN" || hasCap(caps, "crm.edit");

  const [open, setOpen] = useState(false);
  const closed = row.status === "RESOLVED" || row.status === "REJECTED";

  const [nextStatus, setNextStatus] = useState<IssueStatus>(
    closed ? row.status : "RESOLVED",
  );
  const [resolution, setResolution] = useState<IssueResolution>(
    row.resolution ?? "EXPLAINED",
  );
  const [note, setNote] = useState(row.resolutionNote ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/crm/issues/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          // Only sent when resolving — the API 422s a bare status change to
          // RESOLVED that omits it.
          resolution: nextStatus === "RESOLVED" ? resolution : null,
          resolution_note: note || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Could not save the issue");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "cursor-pointer border-b border-border transition-colors",
          open ? "bg-surface-2" : "hover:bg-surface-2",
        )}
      >
        <td className="px-3.5 py-3">
          <SeverityPill severity={row.severity} />
        </td>
        <td className="px-3.5 py-3">
          <div className="font-mono text-[12.5px] font-semibold text-text-1">
            {row.orderNo}
          </div>
          <div className="max-w-[180px] truncate text-[11.5px] text-text-3">
            {row.partyName}
          </div>
        </td>
        <td className="px-3.5 py-3 text-text-2">
          {row.quality ?? <span className="text-text-3">Whole order</span>}
          {row.designNo ? (
            <span className="text-text-3"> · {row.designNo}</span>
          ) : null}
        </td>
        <td className="px-3.5 py-3 text-text-2">{categoryLabel(row.category)}</td>
        <td className="px-3.5 py-3">
          {row.ownerDept ? (
            <span className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-text-3">
              {DEPT_LABEL[row.ownerDept] ?? row.ownerDept}
            </span>
          ) : (
            <span className="text-text-3">unassigned</span>
          )}
        </td>
        <td className="px-3.5 py-3 text-right font-mono">
          <span
            className={
              !closed && row.ageDays >= 14
                ? "text-status-red"
                : !closed && row.ageDays >= 7
                  ? "text-status-amber"
                  : "text-text-2"
            }
          >
            {row.ageDays}d
          </span>
        </td>
        <td className="px-3.5 py-3 text-right font-mono text-text-1">
          {money(row.orderValue)}
        </td>
        <td className="px-3.5 py-3">
          <Pill tone={STATUS_TONE[row.status]} dot={false}>
            {STATUS_TEXT[row.status]}
          </Pill>
        </td>
      </tr>

      {open ? (
        <tr className="border-b border-border bg-surface-2">
          <td colSpan={8} className="px-4 py-3.5">
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-[11px] tracking-[0.04em] text-text-3 uppercase">
                  What happened
                </div>
                <p className="mt-1 text-[13px] text-text-1">
                  {row.description || "No description was recorded."}
                </p>
                <p className="mt-1 text-[11.5px] text-text-3">
                  Raised {formatDate(row.createdAt)}
                  {row.resolvedAt
                    ? ` · closed ${formatDate(row.resolvedAt)}${row.resolvedBy ? ` by ${row.resolvedBy}` : ""}`
                    : ""}
                  {row.qtyAffected != null
                    ? ` · ${formatNumber(row.qtyAffected)} m affected`
                    : ""}
                </p>
              </div>

              {closed ? (
                <div className="text-[12.5px] text-text-3">
                  Resolved as{" "}
                  <strong className="text-text-1">
                    {row.resolution ? RESOLUTION_LABEL[row.resolution] : "—"}
                  </strong>
                  {row.resolutionNote ? ` — ${row.resolutionNote}` : ""}
                </div>
              ) : canEdit ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className={fieldCls}
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value as IssueStatus)}
                  >
                    {ISSUE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_TEXT[s]}
                      </option>
                    ))}
                  </select>
                  {nextStatus === "RESOLVED" ? (
                    <select
                      className={fieldCls}
                      value={resolution}
                      onChange={(e) =>
                        setResolution(e.target.value as IssueResolution)
                      }
                    >
                      {ISSUE_RESOLUTIONS.map((r) => (
                        <option key={r} value={r}>
                          {RESOLUTION_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="How was it settled?"
                    className={cn(fieldCls, "min-w-[220px] flex-1")}
                  />
                  <Button size="lg" disabled={isPending} onClick={save}>
                    Save
                  </Button>
                  {error ? (
                    <span className="text-[12px] text-status-red">{error}</span>
                  ) : null}
                </div>
              ) : (
                <p className="text-[12.5px] text-text-3">
                  You don&rsquo;t have permission to triage issues.
                </p>
              )}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
