"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { checklistDb } from "@/db/checklist";
import { doers, occurrences, tasks } from "@/db/checklist/schema";
import { requireChecklistAdmin } from "@/lib/checklist/authz";
import { parseDoers } from "@/lib/checklist/import-parsers";
import { normaliseEmail } from "@/lib/checklist/import";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Doers — writes
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `requireChecklistAdmin()` is the FIRST line of every one of these, before an
 * argument is read. A server action is a POST endpoint that does not care
 * which page the caller was on; hiding a button hides nothing. The screen's
 * own check exists so a non-admin sees an honest page, and this is the actual
 * boundary.
 */

const paths = () => {
  revalidatePath("/checklist/doers");
  revalidatePath("/checklist/tasks");
  revalidatePath("/checklist");
};

export type DoerInput = {
  name: string;
  email: string;
  department: string | null;
  isAdmin: boolean;
};

export async function createDoer(input: DoerInput) {
  await requireChecklistAdmin();

  const name = input.name.trim();
  const email = normaliseEmail(input.email);
  if (!name) throw new Error("A name is needed.");
  if (!email) throw new Error("That email address does not look right.");

  const [existing] = await checklistDb
    .select({ id: doers.id, name: doers.name, deletedAt: doers.deletedAt })
    .from(doers)
    .where(eq(doers.email, email))
    .limit(1);

  if (existing && existing.deletedAt === null) {
    throw new Error(`${existing.name} is already on the list with that email.`);
  }

  // A soft-deleted row still holds that email in the unique index, so adding
  // the person back has to REVIVE it. Refusing would report a clash with
  // somebody the screen does not show — an error nobody could act on. Their
  // completed history reattaches with them, which is the point of keeping it.
  if (existing) {
    await checklistDb
      .update(doers)
      .set({
        name,
        department: input.department?.trim() || null,
        isAdmin: input.isAdmin,
        active: true,
        deletedAt: null,
      })
      .where(eq(doers.id, existing.id));
    paths();
    return existing.id;
  }

  const [row] = await checklistDb
    .insert(doers)
    .values({
      name,
      email,
      department: input.department?.trim() || null,
      isAdmin: input.isAdmin,
    })
    .returning({ id: doers.id });

  paths();
  return row.id;
}

export async function updateDoer(id: number, input: DoerInput) {
  await requireChecklistAdmin();

  const name = input.name.trim();
  const email = normaliseEmail(input.email);
  if (!name) throw new Error("A name is needed.");
  if (!email) throw new Error("That email address does not look right.");

  // The uniqueness check excludes this row, so saving somebody without
  // changing their address does not refuse itself.
  const [clash] = await checklistDb
    .select({ name: doers.name })
    .from(doers)
    .where(and(eq(doers.email, email), ne(doers.id, id), isNull(doers.deletedAt)))
    .limit(1);
  if (clash) throw new Error(`${clash.name} already uses that email.`);

  await checklistDb
    .update(doers)
    .set({
      name,
      email,
      department: input.department?.trim() || null,
      isAdmin: input.isAdmin,
      // Changing the address breaks the old link. Clearing it lets the next
      // sign-in re-match on the new one, rather than leaving this row pointing
      // at whichever ERP account happened to match the previous address.
      userId: null,
    })
    .where(eq(doers.id, id));

  paths();
}

/**
 * Turn somebody off, or back on.
 *
 * Deactivating keeps every completed row and stops future occurrences being
 * generated for them. It does NOT remove work already scheduled — that would
 * erase a record of what was expected, and somebody leaving in October does
 * not mean nothing was due in September.
 */
export async function setDoerActive(id: number, active: boolean) {
  await requireChecklistAdmin();
  await checklistDb.update(doers).set({ active }).where(eq(doers.id, id));
  paths();
}

/**
 * Delete a doer. ALWAYS ALLOWED — and it keeps what they actually did.
 *
 * ── THE OLD BEHAVIOUR WAS WRONG FOR THIS BUSINESS ────────────────────────
 *
 * This used to refuse while somebody had tasks or history, and offer
 * Deactivate instead. That is defensible in the abstract and useless in
 * practice: a row added by mistake, or somebody who left in April, cannot be
 * cleared off a list they will sit on for ever. The owner asked for a Delete
 * that works, and for old entries to stay while new ones stop.
 *
 * Both are only possible as a soft delete. A real `DELETE` would cascade
 * through their tasks into every occurrence, taking a year of ticks with it
 * and silently changing every figure on the dashboard.
 *
 * ── SO THREE THINGS HAPPEN, IN THIS ORDER ────────────────────────────────
 *
 *   1. Every occurrence of theirs NOT ticked off is removed — past and
 *      future. Future dates are work nobody will do; past ones nobody can
 *      action, and leaving them would keep a deleted person in the Delayed
 *      count for ever.
 *   2. Their tasks are marked deleted, so nothing more is ever generated.
 *   3. They are marked deleted and leave every list and dropdown.
 *
 * What survives is the ticks — and those still read correctly, because an
 * occurrence carries its own snapshot of the task name and the doer row is
 * still there to be joined to.
 */
export async function deleteDoer(
  id: number,
): Promise<{ keptDone: number; removedOpen: number; tasksStopped: number }> {
  await requireChecklistAdmin();

  const [{ n: keptDone }] = await checklistDb
    .select({ n: sql<number>`count(*)::int` })
    .from(occurrences)
    .where(and(eq(occurrences.doerId, id), eq(occurrences.status, "Done")));

  // `status <> 'Done'` is in the statement, not applied after a read.
  const gone = await checklistDb
    .delete(occurrences)
    .where(and(eq(occurrences.doerId, id), ne(occurrences.status, "Done")))
    .returning({ id: occurrences.id });

  const stopped = await checklistDb
    .update(tasks)
    .set({ deletedAt: new Date(), active: false, updatedAt: new Date() })
    .where(and(eq(tasks.doerId, id), isNull(tasks.deletedAt)))
    .returning({ id: tasks.id });

  await checklistDb
    .update(doers)
    .set({ deletedAt: new Date(), active: false })
    .where(eq(doers.id, id));

  paths();
  return { keptDone, removedOpen: gone.length, tasksStopped: stopped.length };
}

/**
 * Bulk import.
 *
 * Takes the RAW TEXT and re-parses it here. The browser's preview is a
 * courtesy — whoever is looking at it can change it — so the server reads the
 * spreadsheet again, against a freshly-read list of who already exists, and
 * inserts only what it judges for itself.
 */
export async function importDoers(text: string) {
  await requireChecklistAdmin();

  const existing = await checklistDb
    .select({ email: doers.email })
    .from(doers)
    .where(isNull(doers.deletedAt));
  const rows = parseDoers(text, new Set(existing.map((r) => r.email)));

  const toAdd = rows.flatMap((r) => (r.verdict === "add" && r.value ? [r.value] : []));

  let added = 0;
  if (toAdd.length > 0) {
    // Chunked, and `onConflictDoNothing` on top of the parser's own duplicate
    // check — two people importing at once is unlikely, but a unique-index
    // violation halfway through a 200-row insert would leave the list in a
    // state nobody asked for.
    const CHUNK = 200;
    for (let i = 0; i < toAdd.length; i += CHUNK) {
      // `doUpdate`, not `doNothing`. The parser has already marked anybody
      // currently on the list as "already there", so the only row this can
      // collide with is one that was soft-deleted — and importing that person
      // again means bringing them back, not silently skipping them.
      const written = await checklistDb
        .insert(doers)
        .values(toAdd.slice(i, i + CHUNK))
        .onConflictDoUpdate({
          target: doers.email,
          set: {
            name: sql`excluded.name`,
            department: sql`excluded.department`,
            isAdmin: sql`excluded.is_admin`,
            active: true,
            deletedAt: null,
          },
        })
        .returning({ id: doers.id });
      added += written.length;
    }
  }

  paths();
  return {
    added,
    skipped: rows.filter((r) => r.verdict === "skip").length + (toAdd.length - added),
    failed: rows.filter((r) => r.verdict === "error").length,
  };
}
