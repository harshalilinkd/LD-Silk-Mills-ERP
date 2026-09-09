"use server";

import { requireErpAdmin } from "@/lib/admin";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { systems } from "@/db/schema";
import {
  SYSTEM_CATEGORIES,
  type SystemCategory,
} from "@/lib/system-categories";

export async function updateSystem(
  id: string,
  data: {
    status: "active" | "coming_soon" | "maintenance";
    /**
     * Which heading it sits under in the sidebar. It was read-only until now,
     * so moving SCOT out of Operations meant an UPDATE against the live table
     * — which is not something the owner of this ERP should have to ask for.
     */
    category: SystemCategory;
    applicationUrl: string | null;
    sortOrder: number;
  },
) {
  // FIRST, before the arguments are even read. A server action is a POST
  // endpoint: hiding the page does not hide it.
  await requireErpAdmin();

  // The enum is re-checked here rather than trusted from the dropdown: a
  // server action is a POST endpoint and a `<select>` proves nothing about
  // what was sent. An unknown value would otherwise reach Postgres and fail
  // as a 500 instead of a sentence.
  if (!SYSTEM_CATEGORIES.includes(data.category)) {
    throw new Error("That is not a section of the menu.");
  }

  await db
    .update(systems)
    .set({
      status: data.status,
      category: data.category,
      applicationUrl: data.applicationUrl || null,
      sortOrder: data.sortOrder,
      updatedAt: new Date(),
    })
    .where(eq(systems.id, id));

  // The sidebar reads systems on every authenticated page, so revalidate
  // broadly rather than just this admin route.
  revalidatePath("/", "layout");
}
