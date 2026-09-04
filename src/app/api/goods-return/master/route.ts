import { NextResponse, type NextRequest } from "next/server";

import { canOpenGoodsReturn } from "@/lib/goods-return/authz";
import {
  searchMasterOptions,
  type MasterType,
} from "@/lib/goods-return/master-data";

/**
 * Type-ahead for the entry form's four pickers.
 *
 * An endpoint rather than a server action because it is a READ that fires on
 * every keystroke: an action would opt the whole route into the server-action
 * pipeline and revalidate on each call, which is a lot of machinery for
 * "give me twenty names starting with KAM".
 *
 * It has to be a search rather than a preloaded list — there are 5,562 parties.
 * Shipping them all to the browser to filter locally is roughly 300 KB on every
 * visit to the form, on a phone, to answer a question the database answers in
 * milliseconds.
 *
 * `partyId` matters ONLY for brokers: a party's brokers come from the
 * party_brokers join, and offering a broker who does not trade for that party
 * is the mistake those 5,359 rows exist to prevent.
 */
const TYPES = ["parties", "brokers", "qualities", "transports"] as const;

const asType = (v: string | null): MasterType | null =>
  (TYPES as readonly string[]).includes(v ?? "") ? (v as MasterType) : null;

export async function GET(req: NextRequest) {
  const access = await canOpenGoodsReturn();
  if (!access) return new NextResponse("Not permitted", { status: 403 });

  const sp = req.nextUrl.searchParams;
  const type = asType(sp.get("type"));
  if (!type) return NextResponse.json({ error: "Unknown list" }, { status: 400 });

  const partyRaw = Number(sp.get("partyId"));
  const options = await searchMasterOptions({
    type,
    q: sp.get("q") ?? undefined,
    partyId: Number.isInteger(partyRaw) && partyRaw > 0 ? partyRaw : undefined,
  });

  return NextResponse.json({ options });
}
