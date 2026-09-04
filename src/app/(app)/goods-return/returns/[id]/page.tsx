import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft, IconPaperclip, IconPencil } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { isStoragePath } from "@/lib/goods-return/attachments";
import { canEditReturns, getChosenOffice } from "@/lib/goods-return/authz";
import { receivedByNames } from "@/lib/goods-return/receiving";
import {
  getReturnDetail,
  resolveReturnId,
} from "@/lib/goods-return/returns-query";
import { MoneyCell, QtyCell } from "../../money-cell";
import { StatusPill } from "../../status-pill";
import { ReturnTimeline } from "./timeline";

export const metadata: Metadata = { title: "Return — LD Silk Mills ERP" };

const d = (v: string | null) =>
  v
    ? new Date(v).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

/** One label/value pair. `null` prints an em dash, never a blank cell. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-[0.02em] text-text-3 uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-[13.5px] text-text-1">{children ?? "—"}</dd>
    </div>
  );
}

export default async function ReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: raw } = await params;
  // Accepts the internal id every link uses AND the LD-#### number people
  // actually know — see resolveReturnId.
  const id = await resolveReturnId(raw);
  if (id === null) notFound();

  const office = await getChosenOffice();
  const ret = await getReturnDetail(id);
  if (!ret) notFound();

  // Who received it, from OUR audit trail — see the note in receiving.ts. The
  // 277 received in the standalone app have no entry and stay honestly blank.
  const receivers = await receivedByNames([ret.displayId]);
  const receiver = receivers.get(ret.displayId) ?? null;

  const canEdit = office ? canEditReturns(office) : false;

  // Sum in NUMBERS, once, here — postgres.js hands every numeric back as a
  // string and "69725.00" + "375.00" is "69725.00375.00".
  const parts = [ret.totalValue, ret.transportValue, ret.otherCharges].map((v) =>
    v == null ? null : Number(v),
  );
  const sum = parts.some((p) => p != null)
    ? parts.reduce<number>((a, b) => a + (b ?? 0), 0)
    : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="num text-[22px] font-bold tracking-[-0.01em] text-text-1">
              {ret.displayId}
            </h1>
            <StatusPill status={ret.status} />
          </div>
          <p className="mt-1 text-[13px] text-text-3">
            {ret.entryFor} · {ret.partyName ?? "Unknown party"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              nativeButton={false}
              render={<Link href={`/goods-return/returns/${ret.id}/edit`} />}
            >
              <IconPencil className="size-4" /> Edit
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            nativeButton={false}
            render={<Link href="/goods-return/returns" />}
          >
            <IconArrowLeft className="size-4" /> Back
          </Button>
        </div>
      </div>

      <Reveal index={0}>
        <section className="rounded-card border border-border bg-surface p-4">
          <ReturnTimeline
            createdAt={ret.createdAt}
            postedOn={ret.postedOn}
            receivedAt={ret.receivedAt}
          />
        </section>
      </Reveal>

      <Reveal index={1}>
        <section className="rounded-card border border-border bg-surface">
          <h2 className="border-b border-border px-4 py-3 text-[14.5px] font-bold text-text-1">
            Details
          </h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Entry for">{ret.entryFor}</Field>
            <Field label="Bill no">{ret.billNo}</Field>
            <Field label="LR / tracking no">
              {ret.trackingNo ? (
                <span className="num">{ret.trackingNo}</span>
              ) : null}
            </Field>
            <Field label="Date">
              <span className="num">{d(ret.dated)}</span>
            </Field>
            <Field label="Posted to Bhiwandi">
              <span className="num">{d(ret.postedOn)}</span>
            </Field>
            <Field label="Transport">{ret.transportName}</Field>
            <Field label="Party">{ret.partyName}</Field>
            <Field label="Broker">{ret.brokerName}</Field>
            <Field label="Reason">
              {ret.returnReason}
              {ret.customReason ? (
                <span className="mt-0.5 block text-[12.5px] text-text-3">
                  {ret.customReason}
                </span>
              ) : null}
            </Field>
            <Field label="Attachment">
              {ret.attachmentUrl ? (
                <a
                  // Files we stored go through the proxy, which re-checks access
                  // on every view. A full https:// value is a legacy public URL
                  // from the standalone app and is linked straight out — both
                  // shapes exist in this column, so both are handled rather
                  // than one rendering as a broken link.
                  href={
                    isStoragePath(ret.attachmentUrl)
                      ? `/api/goods-return/attachments/${ret.id}`
                      : ret.attachmentUrl
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-accent-text hover:underline"
                >
                  <IconPaperclip className="size-3.5" /> Open
                </a>
              ) : null}
            </Field>
          </dl>
        </section>
      </Reveal>

      <Reveal index={2}>
        <section className="rounded-card border border-border bg-surface">
          <h2 className="border-b border-border px-4 py-3 text-[14.5px] font-bold text-text-1">
            Quality lines{" "}
            <span className="num font-medium text-text-3">
              ({ret.items.length})
            </span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="border-b border-border px-4 pt-3 pb-2.5 text-left text-[11px] font-bold tracking-[0.04em] text-text-1 uppercase">
                    Quality
                  </th>
                  <th className="border-b border-border px-4 pt-3 pb-2.5 text-right text-[11px] font-bold tracking-[0.04em] text-text-1 uppercase">
                    Quantity (mtr)
                  </th>
                  <th className="border-b border-border px-4 pt-3 pb-2.5 text-right text-[11px] font-bold tracking-[0.04em] text-text-1 uppercase">
                    Pcs
                  </th>
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {ret.items.map((it) => (
                  <tr key={it.id}>
                    <td className="border-b border-border px-4 py-3 font-medium text-text-1">
                      {it.qualityName ?? "—"}
                    </td>
                    <td className="border-b border-border px-4 py-3 text-right">
                      <QtyCell value={it.quantity} className="text-text-1" />
                    </td>
                    <td className="border-b border-border px-4 py-3 text-right">
                      <QtyCell value={it.pieces} className="text-text-2" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </Reveal>

      <div className="grid gap-4 lg:grid-cols-2">
        <Reveal index={3}>
          <section className="h-full rounded-card border border-border bg-surface">
            <h2 className="border-b border-border px-4 py-3 text-[14.5px] font-bold text-text-1">
              Amounts
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-4">
              <Field label="Total billing">
                <MoneyCell value={ret.totalValue} />
              </Field>
              <Field label="Transport (LR)">
                <MoneyCell value={ret.transportValue} />
              </Field>
              <Field label="Other charges">
                <MoneyCell value={ret.otherCharges} />
              </Field>
              <Field label="Sum">
                <MoneyCell value={sum} className="font-semibold" />
              </Field>
            </dl>
          </section>
        </Reveal>

        <Reveal index={4}>
          <section className="h-full rounded-card border border-border bg-surface">
            <h2 className="border-b border-border px-4 py-3 text-[14.5px] font-bold text-text-1">
              Receiving (Bhiwandi)
            </h2>
            {ret.status === "received" ? (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-4">
                <Field label="Received on">
                  <span className="num">
                    {ret.receivedAt
                      ? new Date(ret.receivedAt).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : null}
                  </span>
                </Field>
                <Field label="Received by">{receiver?.name}</Field>
                <Field label="Transport (Balasaheb)">
                  <MoneyCell value={ret.bhiwandiTransportValue} />
                </Field>
                <Field label="Bhiwandi charges">
                  <MoneyCell value={ret.bhiwandiCharges} />
                </Field>
                {ret.receivingNotes ? (
                  <div className="col-span-2">
                    <Field label="Notes">{ret.receivingNotes}</Field>
                  </div>
                ) : null}
              </dl>
            ) : (
              <div className="flex flex-col gap-1.5 px-4 py-8 text-center">
                <p className="text-[13.5px] font-medium text-text-1">
                  Not received yet
                </p>
                <p className="mx-auto max-w-xs text-[12.5px] text-text-3">
                  Bhiwandi confirms arrival and enters what the transport
                  actually cost. Until then these stay blank.
                </p>
              </div>
            )}
          </section>
        </Reveal>
      </div>
    </div>
  );
}
