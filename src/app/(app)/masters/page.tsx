import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getErpAdmin } from "@/lib/admin";
import { DropdownMaster } from "@/components/order-entry/settings/dropdown-master";
import { GoodsReturnLists } from "./goods-return-lists";

export const metadata: Metadata = { title: "Masters — LD Silk Mills ERP" };

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Masters — every shared list, in one place
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * These nine lists were never module-specific. They live in ONE table
 * (`ld_order_entry.lookup_values`, split only by a `category` column) and are
 * read by the order form, the CRM call panel and the issues board alike — but
 * they were edited in two different screens, both buried under Order Entry
 * Settings, and three of them were only reachable from a CRM tab that has no
 * menu entry of its own. Somebody adding a transport company had to know to
 * look inside Orders.
 *
 * Nothing moved in the database. The same rows, the same API, the same
 * permissions — this is where you edit them from now.
 *
 * ── WHY ALL NINE, WHEN SIX WERE ASKED FOR ─────────────────────────────────
 *
 * The six named (Party, Fabric, Agent, Transport, Haste, Sales person) sit in
 * the same table as three CRM ones. Leaving those three behind would mean
 * keeping the old buried screen alive for them alone, which is the exact
 * problem this page exists to remove.
 *
 * ── DEPARTMENTS ───────────────────────────────────────────────────────────
 *
 * `CRM_DEPT` is the company department list — the owner's decision when told
 * there were two. Help Slip keeps its own small table for now because its
 * `profiles.department_id` is a foreign key and needs real ids; that module is
 * not live, has four placeholder records, and gets pointed at this list when it
 * is. Doing it now would mean migrating a foreign key for no live benefit.
 *
 * ── AND THE FOUR THAT ARE NOT IN THIS TABLE AT ALL ────────────────────────
 *
 * Goods Return keeps parties, brokers, qualities and transports in its OWN
 * tables in the `goods_return` schema, because all 341 of its returns point at
 * those rows by integer id. They appear at the bottom of this page as their own
 * section rather than as four more tabs, since they cannot be served by the
 * same API — see `./goods-return-lists.tsx`.
 *
 * ── PERMISSIONS ───────────────────────────────────────────────────────────
 *
 * ERP admin to see the page, and the lookup API keeps its own Order Entry
 * ADMIN check underneath — so this cannot become a way around that. A shell
 * admin without Order Entry access sees the page and gets a refusal from the
 * list itself, which is the honest failure.
 */

const SHARED_LISTS = [
  // The order form's six.
  { key: "PARTY", label: "Party" },
  { key: "FABRIC", label: "Fabric" },
  { key: "AGENT", label: "Agent" },
  { key: "TRANSPORT", label: "Transport" },
  { key: "HASTE", label: "Haste" },
  { key: "SALES_PERSON", label: "Sales person" },
  // The three that were only reachable from the CRM tab.
  { key: "CRM_DEPT", label: "Departments" },
  { key: "CRM_ISSUE", label: "Complaint categories" },
  { key: "CRM_DELAY_REASON", label: "Delay reasons" },
];

export default async function MastersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  // Non-throwing: a member gets a redirect, not a 500. Same shape as the
  // /settings tabs — see the note in src/lib/admin.ts.
  const admin = await getErpAdmin();
  if (!admin) redirect("/");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
          Masters
        </h1>
        <p className="text-[13px] text-text-3">
          The shared lists every module picks from — parties, fabrics, agents,
          transporters, departments and the rest. Edited here, used everywhere.
        </p>
      </div>

      <DropdownMaster categories={SHARED_LISTS} />

      {/* Goods Return keeps its own four tables — see the component header for
          why they are not folded into the nine above. */}
      <GoodsReturnLists
        type={one("gr")}
        q={one("grq")}
        page={one("grpage")}
      />
    </div>
  );
}
