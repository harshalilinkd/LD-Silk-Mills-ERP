import "server-only";

import { agentPerformance } from "./order-entry/agent-performance";
import { customerLedger } from "./order-entry/customer-ledger";
import { lineDetail } from "./order-entry/line-detail";
import { orderRegister } from "./order-entry/order-register";
import { productionStatus } from "./order-entry/production-status";
import { qualityAnalysis } from "./order-entry/quality-analysis";
import { rateAnalysis } from "./order-entry/rate-analysis";
import { statusSummary } from "./order-entry/status-summary";
import { workInProgress } from "./order-entry/work-in-progress";
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

export const REPORTS: ReportDefinition[] = [
  // Order Entry, in the order somebody works through them: the record first,
  // then the detail, then the process, then the analysis.
  orderRegister,
  lineDetail,
  statusSummary,
  productionStatus,
  workInProgress,
  customerLedger,
  agentPerformance,
  qualityAnalysis,
  rateAnalysis,
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
  return order
    .map((module) => ({
      module,
      label: MODULE_META[module].label,
      reports: REPORTS.filter((r) => r.module === module),
    }))
    .filter((g) => g.reports.length > 0);
}
