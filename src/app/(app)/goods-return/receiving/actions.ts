"use server";

import { revalidatePath } from "next/cache";

import { canOpenGoodsReturn } from "@/lib/goods-return/authz";
import {
  markReceived as markReceivedRecord,
  type ReceiveInput,
  type ReceiveResult,
} from "@/lib/goods-return/receiving";

/**
 * Mark a return received.
 *
 * The access check runs FIRST, before the arguments are read. A server action
 * is a POST endpoint: hiding the button hides nothing, and this one writes
 * money onto a live record.
 *
 * The OFFICE is deliberately not checked. Both offices may receive — that is
 * the standalone app's rule, preserved — and the office is a mode anybody can
 * switch anyway, so a check on it would be theatre. `canOpenGoodsReturn()` is
 * the real boundary and it is the one enforced.
 */
export async function markReceivedAction(
  returnId: number,
  input: ReceiveInput,
): Promise<ReceiveResult> {
  const access = await canOpenGoodsReturn();
  if (!access) {
    return { ok: false, error: "You do not have access to Goods Return." };
  }

  const result = await markReceivedRecord(returnId, access.userId, input);
  if (!result.ok) return result;

  revalidatePath("/goods-return/receiving");
  revalidatePath(`/goods-return/returns/${returnId}`);
  revalidatePath("/goods-return/returns");
  revalidatePath("/goods-return");
  return result;
}
