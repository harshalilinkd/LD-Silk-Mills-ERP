"use server";

import { revalidatePath } from "next/cache";

import { requireErpAdmin } from "@/lib/admin";
import { addMasterName, type MasterType } from "@/lib/goods-return/master-data";

export type AddResult = { ok: true; name: string; created: boolean } | { ok: false; error: string };

/**
 * Add a name to one of Goods Return's four lists, from the Masters screen.
 *
 * Gated on `requireErpAdmin()` rather than on a Goods Return office: this is
 * the ERP's own master-data screen, and the person using it is an
 * administrator managing the business's lists — the same standing every other
 * action on this page has. Somebody working inside the module adds through the
 * entry form instead, which checks the office.
 *
 * INSERT ONLY. There is no rename and no delete here, deliberately: a rename
 * would change what 341 historical returns say they were for, and a delete
 * would break a foreign key or orphan a record.
 */
export async function addGoodsReturnName(
  type: MasterType,
  name: string,
): Promise<AddResult> {
  await requireErpAdmin();

  const res = await addMasterName(type, name);
  if (!res.ok) return res;

  revalidatePath("/masters");
  return { ok: true, name: res.name, created: res.created };
}
