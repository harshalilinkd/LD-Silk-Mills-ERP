"use server";

import { revalidatePath } from "next/cache";

import {
  canOpenGoodsReturn,
  clearChosenOffice,
  setChosenOffice,
  type GoodsReturnOffice,
} from "@/lib/goods-return/authz";

/**
 * Choosing and switching office.
 *
 * Both re-check `canOpenGoodsReturn()` FIRST, before touching the cookie. A
 * server action is a POST endpoint and hiding a screen does not hide it — the
 * same rule every action under /settings follows. The office itself grants
 * nothing (see `authz.ts`), but somebody with no access to the module at all
 * should not be able to set its cookie.
 */
export async function chooseOffice(office: GoodsReturnOffice) {
  const access = await canOpenGoodsReturn();
  if (!access) throw new Error("You do not have access to Goods Return.");
  if (office !== "head_office" && office !== "bhiwandi") {
    throw new Error("Unknown office.");
  }

  await setChosenOffice(office);
  // The whole subtree renders differently per office, so the cached shell for
  // these routes has to go — not just the page that called this.
  revalidatePath("/goods-return", "layout");
}

export async function switchOffice() {
  const access = await canOpenGoodsReturn();
  if (!access) throw new Error("You do not have access to Goods Return.");

  await clearChosenOffice();
  revalidatePath("/goods-return", "layout");
}
