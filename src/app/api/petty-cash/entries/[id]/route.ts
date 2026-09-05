import { NextResponse, type NextRequest } from "next/server";

import { resolvePettyCashViewer } from "@/lib/petty-cash/authz";
import { getTransaction } from "@/lib/petty-cash/queries";

/**
 * One entry, in full, for the detail panel.
 *
 * ── WHY A ROUTE AND NOT PROPS ────────────────────────────────────────────
 *
 * The ledger already has every row it renders, but the detail shows four
 * things the table does not: who created it, who last changed it, and when.
 * Shipping those on every one of a hundred rows to support opening one is a
 * hundred times the payload for the same result — and it would put two more
 * people's names into the page source of a screen that may be over somebody's
 * shoulder.
 *
 * The authorisation is re-checked HERE. A route handler runs without the
 * module's layout above it, so the layout's gate does not protect it.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await resolvePettyCashViewer();
  if (!viewer) return new NextResponse("Not permitted", { status: 403 });

  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  const row = await getTransaction(id);
  if (!row) return new NextResponse("Not found", { status: 404 });

  return NextResponse.json(row, { headers: { "Cache-Control": "no-store" } });
}
