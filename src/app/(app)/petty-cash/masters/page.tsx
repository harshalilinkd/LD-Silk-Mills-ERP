import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { canManageMasters, resolvePettyCashViewer } from "@/lib/petty-cash/authz";
import {
  getCategoriesWithUse,
  getCategoryGroups,
  getPayeesWithUse,
  getPettyCashPeople,
} from "@/lib/petty-cash/queries";
import { MastersScreen } from "./masters-screen";

export const metadata: Metadata = {
  title: "Petty Cash lists — LD Silk Mills ERP",
};

/**
 * The lists the entry form offers, and who may use it.
 *
 * ADMIN ONLY, and refused here rather than hidden. An operator has no business
 * on this screen: the two lists shape every entry anybody records, and the
 * third decides who may spend. `canManageMasters` is the same function the
 * server actions guard on, so the page and the write agree by construction.
 *
 * Four queries, awaited in turn. The pool is five connections wide and
 * pipelined statements stall under the transaction pooler.
 */
export default async function PettyCashMastersPage() {
  const viewer = await resolvePettyCashViewer();
  if (!viewer) redirect("/");
  if (!canManageMasters(viewer)) redirect("/petty-cash");

  const payees = await getPayeesWithUse();
  const categories = await getCategoriesWithUse();
  const groups = await getCategoryGroups();
  const people = await getPettyCashPeople();

  return (
    <MastersScreen
      payees={payees}
      categories={categories}
      groups={groups}
      people={people}
    />
  );
}
