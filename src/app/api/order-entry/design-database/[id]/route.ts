import { eq } from "drizzle-orm";
import { jsonData, jsonError, requireRole } from "@/lib/order-entry/api";
import { orderEntryDb as db } from "@/db/order-entry";
import { designDatabase } from "@/db/order-entry/schema";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/order-entry/design-database/:id — remove a junk log row (ADMIN).
export async function DELETE(_req: Request, { params }: Params) {
  const guard = await requireRole(["ADMIN"]);
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const [deleted] = await db
    .delete(designDatabase)
    .where(eq(designDatabase.id, id))
    .returning({ id: designDatabase.id });
  if (!deleted) return jsonError("Design row not found", 404);

  return jsonData({ id });
}
