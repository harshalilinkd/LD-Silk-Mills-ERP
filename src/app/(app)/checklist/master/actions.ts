"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { checklistDb } from "@/db/checklist";
import { occurrences } from "@/db/checklist/schema";
import { canTick, requireChecklistViewer } from "@/lib/checklist/authz";
import { isIsoDate, todayIso } from "@/lib/checklist/dates";

/**
 * Ticking a row off — the one write in this module that is not an
 * administrator's.
 *
 * ── THE OWNERSHIP CHECK IS A READ, THEN A GUARDED WRITE ──────────────────
 *
 * The row is read to find out whose it is, the permission is decided, and then
 * the UPDATE carries `status = 'Scheduled'` in its own WHERE clause. That last
 * part is not belt and braces: between the read and the write somebody else
 * may have ticked the same row — two people looking at the same shared
 * checklist is the normal case, not the unusual one — and without it the
 * second tick would silently overwrite the first one's date and attribution.
 *
 * `rowCount === 0` therefore means "already done", not "failed", and the
 * screen says so.
 */
export async function markDone(
  occurrenceKey: string,
  actualDate?: string,
): Promise<{ ok: boolean; alreadyDone?: boolean; date?: string }> {
  const viewer = await requireChecklistViewer();

  const [row] = await checklistDb
    .select({
      doerId: occurrences.doerId,
      status: occurrences.status,
      plannedDate: occurrences.plannedDate,
    })
    .from(occurrences)
    .where(eq(occurrences.occurrenceKey, occurrenceKey))
    .limit(1);

  if (!row) throw new Error("That row no longer exists.");
  if (!canTick(viewer, row.doerId)) {
    throw new Error("That is somebody else's task. Only they or an administrator can tick it off.");
  }

  // Defaults to today in Asia/Kolkata, not the server's idea of today — see
  // lib/checklist/dates.ts. A supplied date is only accepted if it parses.
  const when = actualDate && isIsoDate(actualDate) ? actualDate : todayIso();

  const done = await checklistDb
    .update(occurrences)
    .set({
      status: "Done",
      actualDate: when,
      completedBy: viewer.userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(occurrences.occurrenceKey, occurrenceKey),
        eq(occurrences.status, "Scheduled"),
      ),
    )
    .returning({ id: occurrences.id });

  revalidatePath("/checklist/master");
  revalidatePath("/checklist");

  if (done.length === 0) return { ok: false, alreadyDone: true };
  return { ok: true, date: when };
}

/**
 * Undo a tick — administrators only.
 *
 * A member cannot un-tick their own work, and that asymmetry is deliberate:
 * marking something done is a claim, and quietly withdrawing it after the fact
 * is how a scorecard stops meaning anything. A genuine mistake is a
 * conversation with somebody who can fix it.
 */
export async function undoDone(occurrenceKey: string): Promise<void> {
  const viewer = await requireChecklistViewer();
  if (!viewer.isAdmin) {
    throw new Error("Only an administrator can undo a completed task.");
  }

  await checklistDb
    .update(occurrences)
    .set({ status: "Scheduled", actualDate: null, completedBy: null, updatedAt: new Date() })
    .where(eq(occurrences.occurrenceKey, occurrenceKey));

  revalidatePath("/checklist/master");
  revalidatePath("/checklist");
}
