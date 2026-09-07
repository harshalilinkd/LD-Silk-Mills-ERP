import "server-only";

import { orderRegister } from "./order-entry/order-register";
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
  orderRegister,
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
