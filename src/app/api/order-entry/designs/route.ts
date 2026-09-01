import { desc, eq } from "drizzle-orm";
import { jsonData, requireRole } from "@/lib/order-entry/api";
import { orderEntryDb as db } from "@/db/order-entry";
import { ROLES } from "@/lib/order-entry/rbac";
import { designDatabase } from "@/db/order-entry/schema";

export async function GET(req: Request) {
  const guard = await requireRole(ROLES);
  if (!guard.ok) return guard.response;

  const fabric = new URL(req.url).searchParams.get("fabric")?.trim();

  const rows = await db
    .select({ design: designDatabase.designNo, createdAt: designDatabase.createdAt })
    .from(designDatabase)
    .where(fabric ? eq(designDatabase.fabricName, fabric) : undefined)
    .orderBy(desc(designDatabase.createdAt))
    .limit(300);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    if (!seen.has(r.design)) {
      seen.add(r.design);
      out.push(r.design);
    }
    if (out.length >= 50) break;
  }

  return jsonData(out);
}
