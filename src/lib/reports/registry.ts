import "server-only";

import { agentPerformance } from "./order-entry/agent-performance";
import { customerLedger } from "./order-entry/customer-ledger";
import { lineDetail } from "./order-entry/line-detail";
import { orderRegister } from "./order-entry/order-register";
import { productionStatus } from "./order-entry/production-status";
import { qualityAnalysis } from "./order-entry/quality-analysis";
import type { ReportDefinition, ReportModule } from "./types";
import { MODULE_META } from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Every report there is
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hand-maintained, in the order they should be offered. Adding a report is
 * writing one definition file and adding it to this list — no new screen, no
 * new route, no new export code, and it inherits the permission of its module
 * automatically.
 *
 * The catalogue that this list is working towards is the analysis published
 * for the owner: thirty-seven reports across six modules plus four that span
 * them. They arrive module by module, with the richest data first.
 */

/**
 * ── SIX, NOT NINE ────────────────────────────────────────────────────────
 *
 * Cut on the owner's instruction, and the cut was right. Three of the nine
 * were the same sheet twice:
 *
 *   · Order status summary was the order register with progress columns —
 *     both one row per order, both carrying party, agent, transport, metres
 *     and value. Those columns now live on the register.
 *   · Work in progress was production status filtered to the unfinished lines.
 *     Its useful parts — what each line is waiting on, how long it has been
 *     open — are columns on production status now, and "Still open" filters
 *     to exactly the old report.
 *   · Rate analysis is gone at the owner's request. Quality & design analysis
 *     still carries the lowest and highest rate each cloth went out at, which
 *     is the part of it that was never in doubt.
 *
 * What is left answers six genuinely different questions, one each: by order,
 * by line, by process, by customer, by agent, by product. Nothing here repeats
 * anything else.
 */
export const REPORTS: ReportDefinition[] = [
  orderRegister,     // by order
  lineDetail,        // by line
  productionStatus,  // by process
  customerLedger,    // by customer
  agentPerformance,  // by agent
  qualityAnalysis,   // by product
];

export function getReport(id: string): ReportDefinition | null {
  return REPORTS.find((r) => r.id === id) ?? null;
}

export function reportsByModule(): { module: ReportModule; label: string; reports: ReportDefinition[] }[] {
  const order: ReportModule[] = [
    "order-entry",
    "crm",
    "goods-return",
    "petty-cash",
    "help-slip",
    "checklist",
    "cross",
  ];
  // EVERY module, including the ones with nothing built yet. The picker draws
  // those as "coming soon" cards rather than hiding them: the catalogue is
  // thirty-seven reports across seven modules, and somebody looking for a
  // Petty Cash figure should be able to see that it is on its way rather than
  // conclude it was never planned.
  return order.map((module) => ({
    module,
    label: MODULE_META[module].label,
    reports: REPORTS.filter((r) => r.module === module),
  }));
}
