/**
 * The sidebar's headings, as data.
 *
 * ── WHY THIS IS NOT IN `settings/systems/actions.ts` ──────────────────────
 *
 * That file is `"use server"`, and a `"use server"` module may only export
 * ASYNC FUNCTIONS. Exporting the array from there type-checked perfectly and
 * then died in the browser with `SYSTEM_CATEGORIES.map is not a function` —
 * Next had replaced it with a server-action reference on the way across. A
 * runtime rule, invisible to `tsc`, and only findable by opening the page.
 *
 * ── AND NOT IN `db/schema.ts` EITHER ─────────────────────────────────────
 *
 * `systemCategoryEnum.enumValues` is the same list, but importing the schema
 * into a client component drags drizzle and the Postgres driver into the
 * browser bundle. The enum is still the source of truth: `systems.category`
 * is typed from it, so a value added there and not here fails to compile at
 * the call site rather than silently going missing from the dropdown.
 */
export const SYSTEM_CATEGORIES = [
  "sales",
  "operations",
  "finance",
  "reports",
  "admin",
] as const;

export type SystemCategory = (typeof SYSTEM_CATEGORIES)[number];

/** What each one is called on screen — the sidebar prints these same words. */
export const CATEGORY_LABELS: Record<SystemCategory, string> = {
  sales: "Sales",
  operations: "Operations",
  finance: "Finance",
  reports: "Reports",
  admin: "Admin",
};
