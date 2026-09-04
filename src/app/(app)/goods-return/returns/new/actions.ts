"use server";

import { revalidatePath } from "next/cache";

import { canOpenGoodsReturn, getChosenOffice } from "@/lib/goods-return/authz";
import { canCreateReturns } from "@/lib/goods-return/offices";
import { insertReturn } from "@/lib/goods-return/returns";
import { parseReturnFormData } from "@/lib/goods-return/validation";

export type SaveResult = { error?: string; id?: number; displayId?: string };

/**
 * Create a return.
 *
 * The access check runs before the form data is read, for the usual reason: a
 * server action is a POST endpoint and hiding the screen hides nothing.
 *
 * `parseReturnFormData` re-runs the SAME zod schema the form used, and it is
 * this run that decides. The client-side pass only exists to point at the
 * offending box before a round trip.
 *
 * Attachments are not wired yet — the file input is on the form and the column
 * is on the table, but nothing has ever been uploaded in this module and the
 * storage path deserves its own pass rather than being bolted onto the first
 * write. It is passed as null explicitly, so it is visible that it was a
 * decision and not an oversight.
 */
export async function createReturn(formData: FormData): Promise<SaveResult> {
  const access = await canOpenGoodsReturn();
  if (!access) return { error: "You do not have access to Goods Return." };

  const office = await getChosenOffice();
  if (!office || !canCreateReturns(office)) {
    return { error: "Switch to Head Office to record a new return." };
  }

  const parsed = parseReturnFormData(formData);
  // Narrowed on `data`, not on `error`: TypeScript propagates the first and not
  // the second through this union shape, and checking `error` alone leaves
  // `data` possibly undefined at the call below.
  if (!parsed.data) return { error: parsed.error ?? "Invalid input" };

  try {
    const { id, displayId } = await insertReturn(parsed.data, {
      createdBy: null,
      attachmentUrl: null,
    });
    revalidatePath("/goods-return");
    revalidatePath("/goods-return/returns");
    revalidatePath("/goods-return/receiving");
    return { id, displayId };
  } catch (e) {
    console.error("createReturn failed", e);
    return { error: "Could not save the return. Please try again." };
  }
}
