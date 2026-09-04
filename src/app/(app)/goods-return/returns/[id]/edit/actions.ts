"use server";

import { revalidatePath } from "next/cache";

import { canOpenGoodsReturn, getChosenOffice } from "@/lib/goods-return/authz";
import { canEditReturns } from "@/lib/goods-return/offices";
import { updateReturnRecord } from "@/lib/goods-return/returns";
import { parseReturnFormData } from "@/lib/goods-return/validation";

export type SaveResult = { error?: string; id?: number; displayId?: string };

/**
 * Edit a return.
 *
 * WHAT AN EDIT MUST NOT TOUCH, enforced in `updateReturnRecord`: the LD number,
 * the status, who created it, and every receiving column. An edit that could
 * un-receive a return or replace the charges Bhiwandi entered off the bill
 * would make the receiving guard pointless — you could simply walk around it
 * through this screen.
 *
 * The id is REDISCOVERED from the form's own hidden field rather than trusted
 * from the URL alone, and both are checked to agree, so a stale tab cannot post
 * one return's contents onto another.
 */
export async function updateReturn(
  id: number,
  formData: FormData,
): Promise<SaveResult> {
  const access = await canOpenGoodsReturn();
  if (!access) return { error: "You do not have access to Goods Return." };

  const office = await getChosenOffice();
  if (!office || !canEditReturns(office)) {
    return { error: "Switch to Head Office to edit a return." };
  }

  if (!Number.isInteger(id) || id <= 0) return { error: "Unknown return." };

  const posted = Number(formData.get("returnId"));
  if (posted !== id) {
    return { error: "This form is out of date. Reopen the return and try again." };
  }

  const parsed = parseReturnFormData(formData);
  if (!parsed.data) return { error: parsed.error ?? "Invalid input" };

  try {
    // `attachmentUrl` is left out entirely, which `updateReturnRecord` reads as
    // "keep whatever is there" — passing null would silently drop an existing
    // file on every save.
    await updateReturnRecord(id, parsed.data, {});
    revalidatePath("/goods-return");
    revalidatePath("/goods-return/returns");
    revalidatePath(`/goods-return/returns/${id}`);
    return { id };
  } catch (e) {
    console.error("updateReturn failed", e);
    return { error: "Could not save the changes. Please try again." };
  }
}
