import type { ConcernStatus } from "@/db/help-slip/schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The concern status machine. Ported verbatim from the standalone app's
 *  `src/lib/statusMachine.ts` (its Part 13.1).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *        ┌──── put on hold ────┐
 *   new ──▶ in_progress ──▶ waiting ─┘ ──▶ in_progress ──▶ resolved ──▶ closed
 *    └──────────── resolve directly ──────────────────────────┘
 *                          resolved ──▶ in_progress  (reopen, ≤ 7 days)
 *
 * Nothing here is invented and nothing is "tidied": these are the transitions
 * the source declares, in the source's order, with the source's requirements.
 *
 * ── WHY THIS EXISTS TWICE OVER ────────────────────────────────────────────
 *
 * The DATABASE is the boundary. Two CHECK constraints refuse a `waiting` row
 * with no `wait_reason` and a `resolved`/`closed` row with no
 * `resolution_message`, and `concerns_update` is `using (is_staff())` — an
 * employee's UPDATE simply matches zero rows.
 *
 * This module exists so the UI can DISABLE an illegal move rather than offer
 * it and let Postgres reject it afterwards. An error that arrives after a
 * click is a worse explanation than a control that was never enabled — and
 * `blockedReason()` below is what lets a grey button say what would make it
 * available.
 *
 * It is imported by BOTH halves: the workspace screen renders from it, and
 * `src/lib/help-slip/mutations.ts` re-checks against it before writing. One
 * table, so the screen and the route cannot disagree about what is legal.
 * Being dependency-free (types only) is what makes that possible.
 */

export type TransitionRequirement =
  | "wait_reason"
  | "note"
  | "resolution_message";

export type Transition = {
  to: ConcernStatus;
  requires: TransitionRequirement[];
};

/** How long a resolved concern may still be reopened. */
export const REOPEN_WINDOW_DAYS = 7;

const MACHINE: Record<ConcernStatus, Transition[]> = {
  new: [
    // Stamps first_response_at — via `trg_updates_first_response`, never from
    // here. Setting it alongside would race the trigger and win sometimes,
    // which is the worst of both.
    { to: "in_progress", requires: [] },
    { to: "waiting", requires: ["wait_reason", "note"] },
    { to: "resolved", requires: ["resolution_message"] },
  ],
  in_progress: [
    { to: "waiting", requires: ["wait_reason", "note"] },
    { to: "resolved", requires: ["resolution_message"] },
  ],
  waiting: [
    { to: "in_progress", requires: [] },
    { to: "resolved", requires: ["resolution_message"] },
  ],
  resolved: [
    { to: "closed", requires: [] },
    // Reopening is time-boxed; see isReopenable.
    { to: "in_progress", requires: ["note"] },
  ],
  // Terminal. A closed concern is reopened by moving it back to `resolved`
  // first, which nothing offers — deliberately.
  closed: [],
};

export type MachineContext = {
  /** When it was resolved, for the reopen window. */
  resolvedAt?: string | null;
  now?: Date;
};

export function isReopenable(context: MachineContext): boolean {
  if (!context.resolvedAt) return false;
  const resolved = new Date(context.resolvedAt).getTime();
  if (Number.isNaN(resolved)) return false;
  const elapsed = (context.now ?? new Date()).getTime() - resolved;
  return elapsed <= REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/** Every move legal from here, right now. */
export function transitionsFrom(
  from: ConcernStatus,
  context: MachineContext = {},
): Transition[] {
  return MACHINE[from].filter((t) => {
    if (from === "resolved" && t.to === "in_progress") {
      return isReopenable(context);
    }
    return true;
  });
}

export function canTransition(
  from: ConcernStatus,
  to: ConcernStatus,
  context: MachineContext = {},
): boolean {
  return transitionsFrom(from, context).some((t) => t.to === to);
}

export function requirementsFor(
  from: ConcernStatus,
  to: ConcernStatus,
  context: MachineContext = {},
): TransitionRequirement[] {
  return transitionsFrom(from, context).find((t) => t.to === to)?.requires ?? [];
}

/**
 * Why a move is unavailable, as a SENTENCE — so a disabled control can say
 * what would make it available rather than just being grey.
 *
 * The source returns translation keys here and looks them up in its
 * dictionary. This module has no dictionary, so the sentence itself comes
 * back — wrapped in an `{ en }` OBJECT rather than returned bare, because
 * pc-workspace.tsx reads `reason.en` and `reason?.en` in several places and
 * flattening the shape would be a rename on that screen for no gain.
 */
export type BlockedReason = { en: string };

export function blockedReason(
  from: ConcernStatus,
  to: ConcernStatus,
  context: MachineContext = {},
): BlockedReason | null {
  if (canTransition(from, to, context)) return null;
  if (from === "closed") {
    return { en: "This concern is closed." };
  }
  if (from === "resolved" && to === "in_progress") {
    return { en: "Too long since it was resolved to reopen." };
  }
  if (from === to) {
    return { en: "Already there." };
  }
  return { en: "Not possible from the current status." };
}

/**
 * Where a reopen lands when the audit trail's `old_status` is unusable.
 *
 * `waiting` carries a `wait_reason` constraint that may no longer hold, and
 * `new` would claim nobody had ever touched it. Anything else lands on
 * `in_progress`, which is the only target the machine names for a reopen
 * anyway. Same rule as `unresolve_concern` (migration 0018).
 */
export function reopenTarget(
  recordedOldStatus: ConcernStatus | null,
): ConcernStatus {
  if (
    recordedOldStatus === null ||
    recordedOldStatus === "waiting" ||
    recordedOldStatus === "new"
  ) {
    return "in_progress";
  }
  return recordedOldStatus;
}

/** The resolution message is the whole answer an employee gets. "Done" is not. */
export const RESOLUTION_MIN = 10;
