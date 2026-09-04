import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { canCreateReturns, getChosenOffice } from "@/lib/goods-return/authz";
import { OfficeBar } from "../../office-bar";
import { ReturnForm } from "../return-form";
import { createReturn } from "./actions";

export const metadata: Metadata = {
  title: "New return — LD Silk Mills ERP",
};

export default async function NewReturnPage() {
  const office = await getChosenOffice();
  // A Bhiwandi session is sent back rather than shown a form it cannot submit.
  if (office && !canCreateReturns(office)) redirect("/goods-return/receiving");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          New goods return
        </h1>
        <p className="mt-1 hidden text-[13px] text-text-3 sm:block">
          Record a return to post to the Bhiwandi office.
        </p>
        <div className="mt-2">
          <OfficeBar />
        </div>
      </div>

      <ReturnForm mode="create" submit={createReturn} />
    </div>
  );
}
