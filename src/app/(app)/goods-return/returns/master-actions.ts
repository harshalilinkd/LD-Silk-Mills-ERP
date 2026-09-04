"use server";

import { canOpenGoodsReturn, getChosenOffice } from "@/lib/goods-return/authz";
import { canManageMasters } from "@/lib/goods-return/offices";
import { addMasterName, type MasterType } from "@/lib/goods-return/master-data";

export type QuickAddResult =
  | { ok: true; id: number; name: string; created: boolean }
  | { ok: false; error: string };

/**
 * Add a party, broker, quality or transport from inside the entry form.
 *
 * Kept from the standalone app, because the alternative is abandoning a
 * half-typed return to go and add a name somewhere else — which is how a
 * misspelt duplicate gets typed into the box instead.
 *
 * Access is checked FIRST, before the arguments are read: a server action is a
 * POST endpoint and hiding the control hides nothing. The OFFICE is checked too
 * here, unlike in receiving — master data is Head Office work in the standalone
 * app and stays that way. It is not a security boundary (anybody may switch
 * office) but it keeps the rule honest and keeps a Bhiwandi session from
 * quietly growing the party list by mistake.
 */
export async function quickAddMaster(
  type: MasterType,
  name: string,
  partyId?: number,
): Promise<QuickAddResult> {
  const access = await canOpenGoodsReturn();
  if (!access) return { ok: false, error: "You do not have access to Goods Return." };

  const office = await getChosenOffice();
  if (!office || !canManageMasters(office)) {
    return {
      ok: false,
      error: "Switch to Head Office to add to the master lists.",
    };
  }

  const res = await addMasterName(type, name, { partyId });
  if (!res.ok) return res;
  return { ok: true, id: res.id, name: res.name, created: res.created };
}
