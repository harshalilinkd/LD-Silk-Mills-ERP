// Import — Order Entry rules §Import
//
// A thin server shell. The layout above has already refused anyone who is not
// an Order Entry ADMIN, so this reads no session of its own.
//
// It hands the client the MASTER LIST VALUES rather than making the browser
// fetch them: the preview has to say which party and fabric names are new
// before anything is posted, and doing that as a round trip would mean the
// mapping screen sits empty until it lands. Six lists, ~15,000 short strings,
// read once as part of the page.
import { inArray } from "drizzle-orm";

import { orderEntryDb as db } from "@/db/order-entry";
import { lookupValues } from "@/db/order-entry/schema";
import { ImportTabs } from "@/components/order-entry/settings/import-tabs";

const CATEGORIES = [
  "PARTY",
  "FABRIC",
  "AGENT",
  "SALES_PERSON",
  "TRANSPORT",
  "HASTE",
] as const;

export default async function OrderEntryImportPage() {
  const rows = await db
    .select({ category: lookupValues.category, value: lookupValues.value })
    .from(lookupValues)
    .where(inArray(lookupValues.category, [...CATEGORIES]));

  const masterValues: Record<string, string[]> = Object.fromEntries(
    CATEGORIES.map((c) => [c, [] as string[]]),
  );
  for (const r of rows) masterValues[r.category]?.push(r.value);

  return <ImportTabs masterValues={masterValues} />;
}
