"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { goodsReturnDb } from "@/db/goods-return";
import { returns } from "@/db/goods-return/schema";

import { canOpenGoodsReturn, getChosenOffice } from "@/lib/goods-return/authz";
import { canEditReturns } from "@/lib/goods-return/offices";
import {
  deleteAttachment,
  isStoragePath,
  uploadAttachment,
} from "@/lib/goods-return/attachments";
import { updateReturnRecord } from "@/lib/goods-return/returns";
import { setAttachmentPath } from "@/lib/goods-return/set-attachment";
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

  // Read the existing path BEFORE anything is written, so a replaced file can
  // be cleaned up afterwards.
  const [existing] = await goodsReturnDb
    .select({ url: returns.attachmentUrl })
    .from(returns)
    .where(eq(returns.id, id))
    .limit(1);
  const previous = existing?.url ?? null;

  const file = formData.get("attachment");
  const hasFile = file instanceof File && file.size > 0;

  try {
    // `attachmentUrl` is left out entirely, which `updateReturnRecord` reads as
    // "keep whatever is there" — passing null would silently drop an existing
    // file on every save.
    await updateReturnRecord(id, parsed.data, {});

    if (hasFile) {
      const up = await uploadAttachment(id, file);
      if (!up.ok) {
        revalidatePath(`/goods-return/returns/${id}`);
        return { id, error: `The changes were saved, but the new file was not: ${up.error}` };
      }
      // The column is repointed FIRST and the old object removed after, so a
      // failed delete leaves an orphaned file rather than a row pointing at
      // something that no longer exists. A stray object costs kilobytes; a
      // broken link costs somebody a phone call.
      await setAttachmentPath(id, up.path);
      if (previous && isStoragePath(previous)) await deleteAttachment(previous);
    }

    revalidatePath("/goods-return");
    revalidatePath("/goods-return/returns");
    revalidatePath(`/goods-return/returns/${id}`);
    return { id };
  } catch (e) {
    console.error("updateReturn failed", e);
    return { error: "Could not save the changes. Please try again." };
  }
}
