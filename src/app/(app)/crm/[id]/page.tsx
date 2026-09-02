import Link from "next/link";
import { notFound } from "next/navigation";
import { IconAlertTriangle, IconArrowLeft } from "@tabler/icons-react";

import { auth } from "@/auth";
import { resolveOrderEntryAuthz } from "@/lib/order-entry/authz";
import { hasCap } from "@/lib/order-entry/rbac";
import { loadFollowupDetail } from "@/lib/order-entry/crm-query";
import {
  CHANNEL_LABEL,
  OUTCOME_LABEL,
  type AttemptChannel,
  type AttemptOutcome,
  type DelayReason,
  type FollowupStatus,
  type RatingSource,
  type ReorderIntent,
} from "@/lib/order-entry/crm";
import {
  formatDate,
  formatDateTime,
  formatDelay,
  formatNumber,
} from "@/lib/order-entry/orders";
import { Pill, StatusPill } from "@/components/order-entry/crm/pill";
import { AttemptForm } from "@/components/order-entry/crm/attempt-form";
import { IssuePanel } from "@/components/order-entry/crm/issue-panel";
import { FollowupControls } from "@/components/order-entry/crm/followup-controls";

export default async function FollowupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await loadFollowupDetail(id);
  if (!detail) notFound();

  const session = await auth();
  const authz = session?.user?.email
    ? await resolveOrderEntryAuthz(session.user.email)
    : null;
  const canEdit = !!authz && (authz.role === "ADMIN" || hasCap(authz.caps, "crm.edit"));

  const { followup, sla, order, lines, attempts, issues, ratings, criteria } = detail;
  const status = followup.status as FollowupStatus;
  const overdue =
    !!followup.dueAt &&
    (status === "DUE" || status === "IN_PROGRESS") &&
    new Date(followup.dueAt) < new Date();

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/crm"
        className="flex w-fit items-center gap-1.5 text-[12.5px] text-text-3 hover:text-text-1"
      >
        <IconArrowLeft className="size-3.5" /> Back to CRM
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-[22px] font-bold tracking-[-0.01em] text-text-1">
              {followup.orderNo}
            </h1>
            <StatusPill status={status} overdue={overdue} />
            {followup.isEscalated && (
              <Pill tone="late" dot={false}>
                <IconAlertTriangle className="size-3.5" /> Escalated
              </Pill>
            )}
          </div>
          <p className="mt-1 text-[13px] text-text-3">
            {order.partyName} · delivered{" "}
            {formatDate(followup.deliveredAt as unknown as string)}
            {followup.dueAt && status !== "COMPLETED" && status !== "NOT_REQUIRED"
              ? ` · due ${formatDate(followup.dueAt as unknown as string)}`
              : ""}
          </p>
        </div>
        <div className="text-right text-[12.5px] text-text-3">
          <div>Attempt {followup.attemptCount}</div>
          {followup.completedBy && (
            <div className="mt-0.5 text-status-green">
              Completed by {followup.completedBy}
            </div>
          )}
        </div>
      </div>

      {/* Order & SLA summary */}
      <div className="rounded-[10px] border border-border bg-surface">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-[14.5px] font-bold text-text-1">Order &amp; SLA</h2>
        </div>
        <div className="grid grid-cols-2 gap-3.5 px-5 py-[18px] sm:grid-cols-4">
          {[
            ["Sales person", order.salesPerson],
            ["Agent", order.agent],
            ["Transport", order.transport],
            ["Department", order.department],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-[11px] uppercase tracking-[0.04em] text-text-3">
                {label}
              </div>
              <div className="mt-0.5 text-[13px] text-text-1">{value ?? "—"}</div>
            </div>
          ))}
        </div>

        <div className="border-t border-border px-5 py-[18px]">
          <h3 className="mb-2.5 text-[12.5px] font-semibold text-text-1">
            Delivered lines
          </h3>
          {lines.length === 0 ? (
            <p className="text-[12.5px] text-text-3">No lines recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    {["Fabric", "Design", "Qty (m)"].map((h) => (
                      <th
                        key={h}
                        className="border-b border-border pb-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-text-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="[&>tr:last-child>td]:border-b-0">
                  {lines.map((l) => (
                    <tr key={l.id} className={l.isCancelled ? "opacity-50" : ""}>
                      <td className="border-b border-border py-2 text-text-1">
                        {l.quality}
                      </td>
                      <td className="border-b border-border py-2 font-mono text-text-1">
                        {l.designNo}
                        {l.isCancelled && (
                          <span className="ml-1.5 text-[10.5px] text-status-red">
                            (cancelled)
                          </span>
                        )}
                      </td>
                      <td className="border-b border-border py-2 font-mono text-text-2">
                        {formatNumber(Number(l.qtyMtr))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-[18px]">
          <h3 className="mb-2.5 text-[12.5px] font-semibold text-text-1">Workflow SLA</h3>
          {sla.length === 0 ? (
            <p className="text-[12.5px] text-text-3">No stage data recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    {["Stage", "Target (days)", "Late by", "Progress"].map((h) => (
                      <th
                        key={h}
                        className="border-b border-border pb-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-text-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="[&>tr:last-child>td]:border-b-0">
                  {sla.map((s) => (
                    <tr key={s.stageKey}>
                      <td className="border-b border-border py-2 text-text-1">{s.label}</td>
                      <td className="border-b border-border py-2 font-mono text-text-2">
                        {s.targetDays}
                      </td>
                      <td className="border-b border-border py-2 font-mono">
                        <span
                          className={
                            s.lateMinutes > 0 ? "text-status-red" : "text-status-green"
                          }
                        >
                          {formatDelay(s.lateMinutes)}
                        </span>
                      </td>
                      <td className="border-b border-border py-2 text-text-2">
                        {s.done}/{s.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Attempt log */}
      <div className="rounded-[10px] border border-border bg-surface px-5 py-[18px]">
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="text-[14.5px] font-bold text-text-1">Attempt log</h2>
          <span className="text-[12.5px] text-text-3">{attempts.length} logged</span>
        </div>
        {attempts.length === 0 ? (
          <p className="mb-3.5 text-[13px] text-text-3">No attempts logged yet.</p>
        ) : (
          <ul className="mb-3.5 flex flex-col gap-2">
            {attempts.map((a) => (
              <li
                key={a.id}
                className="rounded-lg border border-border bg-surface-2/40 px-3.5 py-2.5 text-[13px]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-text-1">
                    {CHANNEL_LABEL[a.channel as AttemptChannel] ?? a.channel}
                  </span>
                  <span className="text-text-3">
                    {OUTCOME_LABEL[a.outcome as AttemptOutcome] ?? a.outcome}
                  </span>
                  <span className="ml-auto font-mono text-[12px] text-text-3">
                    {formatDateTime(a.attemptedAt as unknown as string)}
                  </span>
                </div>
                {(a.attendedBy || a.createdBy) && (
                  <div className="mt-1 text-[12px] text-text-3">
                    {a.attendedBy ? `By ${a.attendedBy}` : null}
                    {a.attendedBy && a.createdBy ? " · " : null}
                    {a.createdBy ? `Logged by ${a.createdBy}` : null}
                  </div>
                )}
                {a.note && <p className="mt-1 text-[12.5px] text-text-2">{a.note}</p>}
              </li>
            ))}
          </ul>
        )}
        {canEdit && <AttemptForm followupId={followup.id} />}
      </div>

      {/* Issues */}
      <div className="rounded-[10px] border border-border bg-surface px-5 py-[18px]">
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="text-[14.5px] font-bold text-text-1">Issues</h2>
          <span className="text-[12.5px] text-text-3">{issues.length} raised</span>
        </div>
        <IssuePanel
          followupId={followup.id}
          lines={lines}
          issues={issues}
          canEdit={canEdit}
        />
      </div>

      {/* Ratings + status/reorder/notes — one PATCH, per followupUpdateSchema */}
      <FollowupControls
        followupId={followup.id}
        canEdit={canEdit}
        status={status}
        criteria={criteria}
        ratings={ratings}
        ratingOverall={followup.ratingOverall}
        ratingSource={followup.ratingSource as RatingSource | null}
        customerSaysOnTime={followup.customerSaysOnTime}
        delayReason={followup.delayReason as DelayReason | null}
        reorderIntent={followup.reorderIntent as ReorderIntent}
        reorderNote={followup.reorderNote}
        notes={followup.notes}
      />
    </div>
  );
}
