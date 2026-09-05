"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";

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
    .select({ id: doers.id, name: doers.name })
    .from(doers)
    .where(eq(doers.email, email))
    .limit(1);
  if (existing) {
    throw new Error(`${existing.name} is already on the list with that email.`);
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
    .where(and(eq(doers.email, email), ne(doers.id, id)))
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
 * Delete — refused while they have any history at all.
 *
 * The original blocks deletion while a doer has tasks. This goes further and
 * blocks it while they have OCCURRENCES too, because a doer with no current
 * tasks may still have a year of completed work behind them, and the cascade
 * would take it silently. The honest answer for somebody who has left is
 * Deactivate, and the message says so.
 */
export async function deleteDoer(id: number) {
  await requireChecklistAdmin();

  const [{ n: taskCount }] = await checklistDb
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(eq(tasks.doerId, id));
  if (taskCount > 0) {
    throw new Error(
      `They still have ${taskCount} task${taskCount === 1 ? "" : "s"}. Move or delete those first, or use Deactivate instead.`,
    );
  }

  const [{ n: occCount }] = await checklistDb
    .select({ n: sql<number>`count(*)::int` })
    .from(occurrences)
    .where(eq(occurrences.doerId, id));
  if (occCount > 0) {
    throw new Error(
      `They have ${occCount} row${occCount === 1 ? "" : "s"} of checklist history, which deleting would destroy. Use Deactivate instead — it keeps the record and stops new work.`,
    );
  }

  await checklistDb.delete(doers).where(eq(doers.id, id));
  paths();
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

  const existing = await checklistDb.select({ email: doers.email }).from(doers);
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
      const written = await checklistDb
        .insert(doers)
        .values(toAdd.slice(i, i + CHUNK))
        .onConflictDoNothing({ target: doers.email })
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
