"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function updateUser(
  id: string,
  data: { name: string; status: "active" | "inactive" },
) {
  await db
    .update(users)
    .set({ name: data.name, status: data.status, updatedAt: new Date() })
    .where(eq(users.id, id));

  revalidatePath("/admin/users");
}
