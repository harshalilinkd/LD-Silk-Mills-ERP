"use server";

import { requireErpAdmin } from "@/lib/admin";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { systemAccess } from "@/db/schema";

export async function setSystemAccess(
  userId: string,
  systemId: string,
  canView: boolean,
) {
  // FIRST, before the arguments are even read. A server action is a POST
  // endpoint: hiding the page does not hide it.
  await requireErpAdmin();

  const existing = await db
    .select({ id: systemAccess.id })
    .from(systemAccess)
    .where(
      and(
        eq(systemAccess.userId, userId),
        eq(systemAccess.systemId, systemId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(systemAccess)
      .set({ canView, updatedAt: new Date() })
      .where(eq(systemAccess.id, existing[0].id));
  } else {
    await db.insert(systemAccess).values({ userId, systemId, canView });
  }

  revalidatePath("/admin/access-control");
  // Sidebar visibility for the affected user depends on this too.
  revalidatePath("/", "layout");
}
