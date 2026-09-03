import { and, eq, isNull, sql } from "drizzle-orm";
import type { HelpSlipDb } from "@/db/help-slip/rls";
import { concernUpdates, concerns, vConcerns } from "@/db/help-slip/schema";
import type { ConcernPriority, ConcernStatus } from "@/db/help-slip/schema";
import { HelpSlipForbiddenError, HelpSlipRejectedError } from "./api";
import { isStaff, type HelpSlipSession } from "./authz";
import { canTransition, isReopenable } from "./state-machine";
import type { ConcernAction, RaiseConcernInput } from "./validation";

/**
 * Every write Help Slip makes.
 *
 * Three rules run through all of it.
 *
 * 1. **The database does the work wherever it already knows how.**
 *    `raise_concern`, `resolve_concern` and `unresolve_concern` are Postgres
 *    functions that do their whole job in one transaction and let triggers
 *    append the timeline row, stamp `first_response_at` and fire the
 *    notification. Nothing here re-implements any of that — doing so would
 *    produce two of each. They are NOT `security definer`, so they run as the
 *    caller and every RLS policy applies exactly as it does for the standalone
 *    app.
 *
 * 2. **`concern_number`, the status default, `created_at` and
 *    `first_response_at` belong to the database.** Never send them.
 *
 * 3. **Role is re-checked here even though RLS already applies.** They do
 *    different jobs: `concerns_update` is `using (is_staff())`, so an
 *    employee's status change matches zero rows — but a zero-row UPDATE
 *    reports success, and "saved" is the one thing it must never say when
 *    nothing was saved.
 *
 * Everything takes the `db` handed to it by `withHelpSlipRoute`, so it is
 * already inside ONE transaction in the caller's RLS context. That is a real
 * improvement on the source, which runs in a browser and cannot be atomic: its
 * two-step sequences (claim-then-start, note-then-hold) are genuinely atomic
 * here. The ordering is preserved anyway — see `hold`.
 */

export type RaiseResult = {
  concernId: string;
  concernNumber: string;
  /** false when an earlier attempt with the same request id already filed it. */
  created: boolean;
};

/**
 * File a concern and its proposed solutions in ONE round trip.
 *
 * The obvious shape — insert the concern, read back its id, insert the
 * solutions — is the one to avoid: if the second write fails, the result is a
 * concern with no proposed fixes, which is the single artefact this product
 * exists to prevent.
 */
export async function raiseConcern(
  db: HelpSlipDb,
  session: HelpSlipSession,
  input: RaiseConcernInput,
): Promise<RaiseResult> {
  void session; // the filer comes from auth.uid() inside the function, not here

  // Renumbered from what SURVIVED, not from the field index: someone who opens
  // the second box, leaves it blank and fills the third would otherwise produce
  // positions 1 and 3. The slip is a numbered list, not three fixed slots.
  const solutions = input.solutions
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 3);

  const rows = await db.execute(sql`
    select * from ld_help_slip.raise_concern(
      ${input.clientRequestId}::uuid,
      ${input.departmentId}::uuid,
      ${input.title},
      -- Description was removed from the product (26 Aug 2026); the parameter
      -- survives so the RPC signature is unchanged for any other caller.
      ${""},
      ${input.priority}::ld_help_slip.priority,
      ${input.confidential ? "hr_only" : "standard"}::ld_help_slip.visibility,
      ${solutions}::text[],
      ${input.filedForName?.trim() || null}
    )
  `);

  const r = firstRow<{
    out_concern_id: string;
    out_concern_number: string;
    out_created: boolean;
  }>(rows);
  if (!r) throw new HelpSlipRejectedError("That didn't save. Nothing was filed.");

  return {
    concernId: r.out_concern_id,
    concernNumber: r.out_concern_number,
    created: r.out_created,
  };
}

/**
 * Dispatch one action from the concern page.
 *
 * Reads the concern first — through `v_concerns`, so RLS decides whether it is
 * visible at all — and refuses on a missing row with the same words a genuinely
 * absent id would produce. A different answer here would confirm that an id
 * exists, which is exactly what an employee must not learn about a colleague's
 * confidential complaint.
 */
export async function applyConcernAction(
  db: HelpSlipDb,
  session: HelpSlipSession,
  concernId: string,
  action: ConcernAction,
): Promise<void> {
  const [row] = await db
    .select({
      status: vConcerns.status,
      employeeId: vConcerns.employeeId,
      resolvedAt: vConcerns.resolvedAt,
      assignedTo: vConcerns.assignedTo,
    })
    .from(vConcerns)
    .where(eq(vConcerns.id, concernId))
    .limit(1);

  if (!row || !row.status) throw new HelpSlipRejectedError("No such concern.");

  const staff = isStaff(session.role);
  const isOwner = row.employeeId === session.profileId;
  const from = row.status;

  // An employee may comment on their own concern and withdraw it. Everything
  // else is a coordinator's move.
  if (!staff && action.action !== "comment" && action.action !== "withdraw") {
    throw new HelpSlipForbiddenError("Only a coordinator can do that.");
  }

  switch (action.action) {
    case "comment": {
      // An internal note is coordinator-only. An employee asking for one is not
      // an error to correct silently — it is refused, because silently writing
      // it as public would put a note meant to be private on their own screen.
      if (action.isInternal && !staff) {
        throw new HelpSlipForbiddenError("Only a coordinator can add an internal note.");
      }
      if (!staff && !isOwner) {
        throw new HelpSlipForbiddenError("That isn't your concern.");
      }
      await db.insert(concernUpdates).values({
        concernId,
        actorId: session.profileId,
        updateType: "comment",
        message: action.message.trim(),
        isInternal: action.isInternal && staff,
      } as typeof concernUpdates.$inferInsert);
      return;
    }

    case "start": {
      requireTransition(from, "in_progress");
      // Claim it, but ONLY if nobody holds it. Starting work on something IS
      // taking it, and making a coordinator say so twice invites a queue of
      // in-progress concerns owned by nobody. The `is null` is evaluated by the
      // database rather than read-then-written here, so two coordinators
      // pressing Start at the same moment cannot both win — a claim, not a
      // theft.
      await db
        .update(concerns)
        .set({ assignedTo: session.profileId })
        .where(and(eq(concerns.id, concernId), isNull(concerns.assignedTo)));

      // No first_response_at here: a trigger stamps it from the timeline row.
      // Setting it alongside would race the trigger and sometimes win.
      await db
        .update(concerns)
        .set({ status: "in_progress" })
        .where(eq(concerns.id, concernId));
      return;
    }

    case "assign": {
      await db
        .update(concerns)
        .set({ assignedTo: action.assigneeId })
        .where(eq(concerns.id, concernId));
      return;
    }

    case "priority": {
      await db
        .update(concerns)
        .set({ priority: action.priority as ConcernPriority })
        .where(eq(concerns.id, concernId));
      return;
    }

    case "hold": {
      requireTransition(from, "waiting");
      // The note is written FIRST, and the order is deliberate even though both
      // writes share one transaction here. It records the intent: if this ever
      // stops being atomic, the half that survives must be the explanation, not
      // a silent hold.
      await db.insert(concernUpdates).values({
        concernId,
        actorId: session.profileId,
        updateType: "comment",
        message: action.note.trim(),
        isInternal: false,
      } as typeof concernUpdates.$inferInsert);

      await db
        .update(concerns)
        .set({ status: "waiting", waitReason: action.reason })
        .where(eq(concerns.id, concernId));
      return;
    }

    case "resume": {
      requireTransition(from, "in_progress");
      // Clearing wait_reason keeps the row honest for next time.
      await db
        .update(concerns)
        .set({ status: "in_progress", waitReason: null })
        .where(eq(concerns.id, concernId));
      return;
    }

    case "resolve": {
      requireTransition(from, "resolved");
      // ONE call, and this is where that matters most. The four writes it
      // replaces — the message, accepted_solution_id, the
      // status/resolved_at/resolved_by, the timeline row — can each fail
      // second, and every prefix of them is a lie: resolved with no
      // explanation, or explained but still open, with the employee notified
      // about neither.
      await db.execute(sql`
        select * from ld_help_slip.resolve_concern(
          ${concernId}::uuid,
          ${action.resolution.trim()},
          ${action.acceptedSolutionId}::uuid
        )
      `);
      return;
    }

    case "reopen": {
      if (!isReopenable({ resolvedAt: row.resolvedAt?.toISOString() ?? null })) {
        throw new HelpSlipRejectedError(
          "Too long since it was resolved to reopen.",
        );
      }
      await db.execute(sql`
        select * from ld_help_slip.unresolve_concern(
          ${concernId}::uuid,
          ${action.note.trim()}
        )
      `);
      return;
    }

    case "close": {
      requireTransition(from, "closed");
      await db
        .update(concerns)
        .set({ status: "closed", closedAt: new Date() })
        .where(eq(concerns.id, concernId));
      return;
    }

    case "withdraw": {
      // An employee may withdraw their own; a coordinator may withdraw any they
      // can see. A SOFT withdraw — the rows stay and become invisible to
      // everyone, author included. Nothing here hard-deletes a concern.
      if (!staff && !isOwner) {
        throw new HelpSlipForbiddenError("That isn't your concern.");
      }
      await db.execute(sql`
        select ld_help_slip.withdraw_concern(${concernId}::uuid)
      `);
      return;
    }
  }
}

/** Withdraw several at once, from the list screen's selection bar. */
export async function withdrawConcerns(
  db: HelpSlipDb,
  ids: string[],
): Promise<number> {
  const rows = await db.execute(sql`
    select ld_help_slip.withdraw_concerns(${ids}::uuid[]) as n
  `);
  return firstRow<{ n: number }>(rows)?.n ?? 0;
}

/**
 * Refuse an illegal move with the reason, rather than letting Postgres reject
 * it afterwards. The screen disables these buttons from the same table, so
 * reaching here means either a stale page or a hand-made request.
 */
function requireTransition(from: ConcernStatus, to: ConcernStatus): void {
  if (!canTransition(from, to)) {
    throw new HelpSlipRejectedError(
      `A concern that is ${from.replace("_", " ")} can't be moved to ${to.replace("_", " ")}.`,
    );
  }
}

/** drizzle's `execute` returns a driver-shaped result; normalise the first row. */
function firstRow<T>(result: unknown): T | undefined {
  const rows = result as { rows?: T[] } | T[];
  if (Array.isArray(rows)) return rows[0];
  return rows?.rows?.[0];
}
