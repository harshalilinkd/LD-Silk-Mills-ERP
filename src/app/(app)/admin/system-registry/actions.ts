"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { systems } from "@/db/schema";

export async function updateSystem(
  id: string,
  data: {
    status: "active" | "coming_soon" | "maintenance";
    applicationUrl: string | null;
    sortOrder: number;
  },
) {
  await db
    .update(systems)
    .set({
      status: data.status,
      applicationUrl: data.applicationUrl || null,
      sortOrder: data.sortOrder,
      updatedAt: new Date(),
    })
    .where(eq(systems.id, id));

  // The sidebar reads systems on every authenticated page, so revalidate
  // broadly rather than just this admin route.
  revalidatePath("/", "layout");
}
