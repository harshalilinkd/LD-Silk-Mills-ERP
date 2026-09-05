import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";

import { checklistDb } from "@/db/checklist";
import { holidays } from "@/db/checklist/schema";
import { resolveChecklistViewer } from "@/lib/checklist/authz";
import { generationWindow } from "@/lib/checklist/dates";
import { HolidaysScreen } from "./holidays-screen";

export const metadata: Metadata = {
  title: "Holidays — LD Silk Mills ERP",
};

/**
 * Holidays — the dates the generator skips.
 *
 * Administrators only, and for a firmer reason than the other admin screens:
 * adding a row here deletes scheduled work across the whole company.
 */
export default async function HolidaysPage() {
  const viewer = await resolveChecklistViewer();
  if (!viewer) redirect("/checklist");
  if (!viewer.isAdmin) redirect("/checklist/master");

  const rows = await checklistDb
    .select({
      id: holidays.id,
      date: holidays.holidayDate,
      name: holidays.name,
    })
    .from(holidays)
    .orderBy(asc(holidays.holidayDate));

  return <HolidaysScreen rows={rows} window={generationWindow()} />;
}
