import "server-only";

import { eq } from "drizzle-orm";

import { goodsReturnDb } from "@/db/goods-return";
import { returns } from "@/db/goods-return/schema";

/**
 * Point a return at a stored file, or clear it.
 *
 * Deliberately NOT folded into `insertReturn`/`updateReturnRecord`. Those two
 * are the ported writes and their shape is diffed against the standalone app;
 * a second concern living inside them makes that comparison harder for no gain.
 * The column is nullable and independent, so a separate statement costs one
 * round trip and keeps both files honest.
 */
export async function setAttachmentPath(
  id: number,
  path: string | null,
): Promise<void> {
  await goodsReturnDb
    .update(returns)
    .set({ attachmentUrl: path })
    .where(eq(returns.id, id));
}
