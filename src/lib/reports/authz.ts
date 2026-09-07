import "server-only";

import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { systemAccess, systems, users } from "@/db/schema";
import { MODULE_META, type ReportDefinition, type ReportModule } from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Who may run which report
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The owner's rule, in their words: *"all persons who have access to a
 * particular module will be able to export their module's reports — if someone
 * has access to Order Entry then they should be able to download all that
 * module's reports."*
 *
 * So there is no second permission system here. A report inherits the
 * permission of the module it reports on, read from `ld_erp_core.system_access`
 * — the same tick box in Settings → Access that decides whether the module
 * appears in the sidebar at all. Grant somebody Orders and they get every
 * Order Entry report; take it away and they get none.
 *
 * ── WHY THAT IS SAFE, AND WHERE IT ISN'T QUITE ───────────────────────────
 *
 * A report is a bulk read of a module somebody may already browse a page at a
 * time, so it grants no new SIGHT. What it grants is CONVENIENCE — five
 * thousand order lines with every rate in one file instead of clicking through
 * them. That is a real difference in kind, and it is the owner's decision to
 * make; it is recorded here so nobody quietly reverses it later.
 *
 * Two exceptions the owner did not overrule, and both are administrative
 * rather than operational:
 *
 *   · **Cross-module reports** (business summary, customer 360) are offered to
 *     anybody, but only ever show the modules that person can already see. A
 *     summary that silently included Petty Cash for somebody without it would
 *     be a leak dressed as a convenience.
 *   · **Audit trail and Users & access** are ERP-administrator only. They are
 *     about the system's own governance, not about a module's work, and the
 *     audit log names who did what.
 *
 * ── HELP SLIP IS THE ONE MODULE THAT CANNOT WORK THIS WAY ────────────────
 *
 * Its confidentiality lives in Row Level Security, per concern, per person —
 * an HR complaint is invisible even to a coordinator without `hr_access`. A
 * bulk export bypassing that would be the single worst thing this module could
 * do. So its reports run through `withHelpSlip` under the caller's own profile
 * and return exactly what that person could see by clicking. See
 * `src/db/help-slip/rls.ts`.
 */

/** Reports nobody but an ERP administrator may run, whatever else they hold. */
const ADMIN_ONLY = new Set(["cross.audit-trail", "cross.users-access"]);

export type ReportViewer = {
  userId: string;
  name: string;
  email: string;
  isErpAdmin: boolean;
  /** `system_code` of every ACTIVE system this person has been granted. */
  systemCodes: Set<string>;
};

/**
 * Null when nobody is signed in. Everybody with a session may open Reports —
 * what they find inside it is the question this file answers.
 */
export async function resolveReportViewer(): Promise<ReportViewer | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;

  const [account] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(and(eq(users.email, email), eq(users.status, "active")))
    .limit(1);
  if (!account) return null;

  // Only ACTIVE systems count. A `coming_soon` system is a greyed preview in
  // the sidebar and shows everybody a placeholder; it must not hand out data.
  const granted = await db
    .select({ code: systems.systemCode })
    .from(systemAccess)
    .innerJoin(systems, eq(systems.id, systemAccess.systemId))
    .where(
      and(
        eq(systemAccess.userId, account.id),
        eq(systemAccess.canView, true),
        eq(systems.status, "active"),
      ),
    );

  return {
    userId: account.id,
    name: account.name,
    email: account.email,
    isErpAdmin: account.role === "admin",
    systemCodes: new Set(granted.map((g) => g.code)),
  };
}

/** Does this person hold the module a report belongs to? */
export function canRunModule(viewer: ReportViewer, module: ReportModule): boolean {
  const code = MODULE_META[module].systemCode;
  // Cross-module: offered to everyone, and each section inside it is filtered
  // to what the viewer holds. An ERP admin sees all of it.
  if (code === null) return true;
  return viewer.systemCodes.has(code);
}

export function canRunReport(viewer: ReportViewer, report: ReportDefinition): boolean {
  if (ADMIN_ONLY.has(report.id)) return viewer.isErpAdmin;
  return canRunModule(viewer, report.module);
}

/**
 * The modules a cross-module report may include for this person.
 *
 * An ERP administrator gets everything; everybody else gets the sections they
 * could have opened themselves. The report prints which sections were left
 * out, so a short summary never reads as a complete one.
 */
export function visibleModulesFor(viewer: ReportViewer): ReportModule[] {
  const all: ReportModule[] = [
    "order-entry",
    "crm",
    "goods-return",
    "petty-cash",
    "help-slip",
    "checklist",
  ];
  if (viewer.isErpAdmin) return all;
  return all.filter((m) => canRunModule(viewer, m));
}

/** The guard every export path calls FIRST, before reading a parameter. */
export async function requireReport(report: ReportDefinition): Promise<ReportViewer> {
  const viewer = await resolveReportViewer();
  if (!viewer) throw new Error("You are not signed in.");
  if (!canRunReport(viewer, report)) {
    throw new Error(
      ADMIN_ONLY.has(report.id)
        ? "Only an ERP administrator can run that report."
        : `You do not have access to ${MODULE_META[report.module].label}, so you cannot run its reports.`,
    );
  }
  return viewer;
}
