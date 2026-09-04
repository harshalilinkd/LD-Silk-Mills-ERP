import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { canEditReturns, getChosenOffice } from "@/lib/goods-return/authz";
import {
  getReturnDetail,
  resolveReturnId,
} from "@/lib/goods-return/returns-query";
import { OfficeBar } from "../../../office-bar";
import { EditReturn } from "./edit-return";

export const metadata: Metadata = {
  title: "Edit return — LD Silk Mills ERP",
};

/**
 * Edit an existing return.
 *
 * The form is the same component the New screen uses, handed the record as its
 * starting values — one form, one set of rules, so a field added to entry
 * cannot go missing from editing.
 *
 * Every date arrives from Postgres as a `date` and has to reach the form as
 * `YYYY-MM-DD`, which is the only thing `<input type="date">` accepts. Passing
 * a localised string here shows an empty date box on a record that plainly has
 * a date — and then saves that emptiness.
 */
const forDateInput = (v: string | Date | null) => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

/** numeric comes back as "1000.00"; the box should read 1000, not 1000.00. */
const forMoneyInput = (v: string | null) => {
  if (v == null) return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "";
};

export default async function EditReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: raw } = await params;
  const id = await resolveReturnId(raw);
  if (id === null) notFound();

  const office = await getChosenOffice();
  if (office && !canEditReturns(office)) {
    redirect(`/goods-return/returns/${id}`);
  }

  const ret = await getReturnDetail(id);
  if (!ret) notFound();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Edit <span className="num">{ret.displayId}</span>
        </h1>
        <p className="mt-1 hidden text-[13px] text-text-3 sm:block">
          The LD number, the status and Bhiwandi&apos;s figures are not changed
          by an edit.
        </p>
        <div className="mt-2">
          <OfficeBar />
        </div>
      </div>

      <EditReturn
        id={ret.id}
        initial={{
          billNo: ret.billNo ?? "",
          entryFor: ret.entryFor,
          trackingNo: ret.trackingNo ?? "",
          dated: forDateInput(ret.dated),
          postedOn: forDateInput(ret.postedOn),
          partyId: String(ret.partyId),
          partyName: ret.partyName ?? "",
          brokerId: String(ret.brokerId),
          brokerName: ret.brokerName ?? "",
          transportId: ret.transportId ? String(ret.transportId) : "",
          transportName: ret.transportName ?? "",
          totalValue: forMoneyInput(ret.totalValue),
          transportValue: forMoneyInput(ret.transportValue),
          otherCharges: forMoneyInput(ret.otherCharges),
          returnReason: ret.returnReason,
          customReason: ret.customReason ?? "",
          items: ret.items.map((it) => ({
            qualityId: it.qualityId ? String(it.qualityId) : "",
            qualityName: it.qualityName ?? "",
            quantity: forMoneyInput(it.quantity),
            pieces: it.pieces == null ? "" : String(it.pieces),
          })),
        }}
      />
    </div>
  );
}
