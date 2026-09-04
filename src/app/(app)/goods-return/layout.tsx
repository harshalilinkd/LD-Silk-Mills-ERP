import { redirect } from "next/navigation";
import { IconLock } from "@tabler/icons-react";

import { auth } from "@/auth";
import {
  canOpenGoodsReturn,
  getChosenOffice,
} from "@/lib/goods-return/authz";
import { ChooseOffice } from "./choose-office";
import { GoodsReturnProvider } from "./office-context";

/**
 * Goods Return LR.
 *
 * TWO GATES, and only the first is a permission:
 *
 *   1. `canOpenGoodsReturn()` — the security boundary. It reads
 *      `ld_erp_core.system_access`, the tick box in Settings → Access, on the
 *      SERVER. Before this, that tick only decided what appeared in the
 *      sidebar; every other module gets away with that because it re-checks
 *      against its own account table, and this one has none to check.
 *
 *   2. The office — a MODE, not a permission. Anyone through gate 1 may pick
 *      either and switch whenever they like.
 *
 * ── WHY THE CHOOSER RENDERS HERE INSTEAD OF REDIRECTING ──────────────────
 *
 * The obvious shape — redirect to /goods-return/choose-office when no office is
 * set — needs that route to sit OUTSIDE this layout, or it redirects to itself
 * forever. Layouts do not see the pathname, so the escape hatch would have to
 * be a sibling route with a name like /goods-return-office. Rendering the
 * chooser in place of `children` avoids all of it: no second route, no redirect
 * chain, and the address you clicked is the address you land on — which is the
 * bug the owner reported when "Order Entry rules" opened Masters.
 *
 * It also makes switching trivial: clear the cookie and this same layout asks
 * again, from wherever you were standing.
 */
export default async function GoodsReturnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const access = await canOpenGoodsReturn();

  if (!access) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-status-amber-dim">
          <IconLock className="size-6 text-status-amber" />
        </div>
        <h1 className="text-lg font-semibold tracking-[-0.01em] text-text-1">
          Not provisioned for Goods Return
        </h1>
        <p className="max-w-sm text-sm text-text-3">
          Your ERP account ({session.user.email}) has not been given Goods
          Return. An administrator can tick it in Settings → Access.
        </p>
      </div>
    );
  }

  const office = await getChosenOffice();
  if (!office) return <ChooseOffice name={access.name} />;

  return (
    <GoodsReturnProvider
      value={{ office, userId: access.userId, name: access.name }}
    >
      {children}
    </GoodsReturnProvider>
  );
}
