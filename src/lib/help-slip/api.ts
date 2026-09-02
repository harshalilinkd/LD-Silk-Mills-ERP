import { NextResponse } from "next/server";
import { NotProvisionedError, withCurrentUser } from "@/lib/help-slip/authz";
import type { HelpSlipDb } from "@/db/help-slip/rls";
import type { HelpSlipSession } from "@/lib/help-slip/authz";

/**
 * Route-handler plumbing for `/api/help-slip/*`.
 *
 * Same `{ data } | { error }` envelope Order Entry and CRM use, so
 * `api-client.ts` unwraps them identically — but a local copy rather than an
 * import from `@/lib/order-entry/api`, which would drag
 * `resolveOrderEntryAuthz` and the Order Entry RBAC tables into every Help
 * Slip request for the sake of two three-line functions.
 */

export function jsonData(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

/**
 * A screen-level refusal, thrown from inside the handler.
 *
 * This is a RENDERING guard, never a security one — Help Slip's boundary is
 * RLS and it has already applied by the time the handler runs. What this
 * expresses is "an employee asking for the coordinator's queue is asking the
 * wrong question", so the answer is an honest 403 rather than a one-row queue
 * of their own concern that they would reasonably mistake for the real thing.
 */
export class HelpSlipForbiddenError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "HelpSlipForbiddenError";
  }
}

/**
 * Run one handler inside ONE RLS context and turn its result into a response.
 *
 * This is the only shape a Help Slip route should have. It exists to make the
 * concurrency rule in `src/db/help-slip/rls.ts` structurally hard to break:
 * a route calls this once, and every query that request needs goes inside the
 * callback, sharing the one pinned connection. A second `withHelpSlipRoute`
 * in the same handler is the bug this is meant to prevent.
 *
 * `NotProvisionedError` becomes a 403 rather than a 500. The signed-in person
 * has no active Help Slip profile — that is an answer, not a fault, and the
 * screens render it as the "not provisioned" state.
 */
export async function withHelpSlipRoute<T>(
  context: string,
  fn: (db: HelpSlipDb, session: HelpSlipSession) => Promise<T>,
  failureMessage: string,
) {
  try {
    return jsonData(await withCurrentUser(fn));
  } catch (e) {
    if (e instanceof NotProvisionedError) {
      return jsonError(
        "Your account isn't set up in Help Slip yet. Ask an admin to add you.",
        403,
      );
    }
    if (e instanceof HelpSlipForbiddenError) {
      return jsonError(e.reason, 403);
    }
    // The upstream message never reaches the client. A Postgres error can
    // quote a query, and a query here can quote a confidential concern's
    // title; the sentence the screen shows is written above instead.
    console.error(`${context} failed:`, e);
    return jsonError(failureMessage, 500);
  }
}
