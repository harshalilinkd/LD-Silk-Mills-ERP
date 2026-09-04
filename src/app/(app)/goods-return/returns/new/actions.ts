"use server";

import { revalidatePath } from "next/cache";

import { canOpenGoodsReturn, getChosenOffice } from "@/lib/goods-return/authz";
import { canCreateReturns } from "@/lib/goods-return/offices";
import { uploadAttachment } from "@/lib/goods-return/attachments";
import { setAttachmentPath } from "@/lib/goods-return/set-attachment";
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
 * THE FILE IS STORED AFTER THE RETURN, not before, and that ordering is the
 * whole design. The storage path contains the return id, so there is nothing to
 * upload to until the row exists — and more importantly, a failed upload must
 * never lose a return somebody has just spent five minutes typing. So the
 * record is committed first; if the file then fails, the return is saved and
 * the message says the attachment did not stick, which is recoverable by
 * editing. The reverse order loses the typing.
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

  const file = formData.get("attachment");
  const hasFile = file instanceof File && file.size > 0;

  try {
    const { id, displayId } = await insertReturn(parsed.data, {
      createdBy: null,
      attachmentUrl: null,
    });

    if (hasFile) {
      const up = await uploadAttachment(id, file);
      if (up.ok) {
        await setAttachmentPath(id, up.path);
      } else {
        // The return IS saved. Say exactly that, rather than an error that
        // reads as "nothing happened" about a record that now exists.
        revalidatePath("/goods-return/returns");
        return {
          id,
          displayId,
          error: `${displayId} was saved, but the attachment did not: ${up.error}`,
        };
      }
    }

    revalidatePath("/goods-return");
    revalidatePath("/goods-return/returns");
    revalidatePath("/goods-return/receiving");
    return { id, displayId };
  } catch (e) {
    console.error("createReturn failed", e);
    return { error: "Could not save the return. Please try again." };
  }
}
