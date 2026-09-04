import Link from "next/link";

import { getMasterCounts, getMasterList, type MasterType } from "@/lib/goods-return/master-data";
import { cn } from "@/lib/utils";
import { GoodsReturnAdd } from "./goods-return-add";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Goods Return's four lists, on the Masters screen
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A SEPARATE SECTION rather than four more tabs beside Party and Fabric, and
 * the reason is structural rather than cosmetic. The nine lists above are rows
 * in `ld_order_entry.lookup_values`, keyed by a `category` column and edited
 * through one API. These four are their own TABLES in `goods_return`, with
 * integer primary keys that all 341 returns point at. They cannot be served by
 * the same component without pretending two different things are one.
 *
 * ── WHY THEY ARE NOT MERGED ──────────────────────────────────────────────
 *
 * Measured, and the numbers are why: 3,790 of Goods Return's 5,562 party names
 * already appear in the ERP list. They are the same customers kept twice. But
 * merging means rewriting every `party_id` on live records, which is the one
 * class of change this port rules out — so the tables stay, and every name that
 * had no equivalent in the ERP list was ADDED there instead (1,014 rows, one
 * way, once, on 4 Sep 2026).
 *
 * What this section buys is the thing the owner actually asked for: one screen
 * to look at every list in the business, without a risky migration underneath.
 *
 * ── ADDING IS ALLOWED, RENAMING AND DELETING ARE NOT ─────────────────────
 *
 * Unlike the nine lists above, these rows have no `is_active` column and no
 * soft delete — the standalone app's own master screen only ever adds. A rename
 * would silently change what 341 historical returns say they were for, and a
 * delete would violate a foreign key or orphan a record. Adding is safe and is
 * what the entry form needs; the rest deliberately is not offered.
 */

const LISTS: { key: MasterType; label: string; blurb: string }[] = [
  { key: "parties", label: "Parties", blurb: "Customers goods go back to." },
  { key: "brokers", label: "Brokers", blurb: "Agents acting for a party." },
  { key: "qualities", label: "Qualities", blurb: "Fabric names on the lines." },
  { key: "transports", label: "Transports", blurb: "Who carries the goods." },
];

const isType = (v: string | undefined): MasterType | null =>
  LISTS.some((l) => l.key === v) ? (v as MasterType) : null;

export async function GoodsReturnLists({
  type: rawType,
  q,
  page,
}: {
  type?: string;
  q?: string;
  page?: string;
}) {
  const type = isType(rawType) ?? "parties";
  const search = (q ?? "").trim();
  const pageNo = Number(page);

  const counts = await getMasterCounts();
  const list = await getMasterList(
    type,
    search,
    Number.isInteger(pageNo) && pageNo > 0 ? pageNo : 1,
    25,
  );

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const next = { gr: type, grq: search || undefined, grpage: undefined, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    return `/masters?${p.toString()}#goods-return`;
  };

  return (
    <section
      id="goods-return"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <div>
        <h2 className="text-[15px] font-semibold text-text-1">
          Goods Return lists
        </h2>
        <p className="mt-0.5 text-[13px] text-text-3">
          Kept separately from the lists above because every goods return points
          at these rows by number. New names can be added here; renaming and
          deleting are not offered, because 341 records depend on them.
        </p>
      </div>

      <nav className="flex flex-wrap gap-1.5 rounded-field border border-border bg-surface-2 p-1.5">
        {LISTS.map((l) => {
          const active = l.key === type;
          return (
            <Link
              key={l.key}
              href={href({ gr: l.key, grq: undefined })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-[8px] px-3.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-surface text-text-1 shadow-sm"
                  : "text-text-3 hover:text-text-1",
              )}
            >
              {l.label}
              <span
                className={cn(
                  "num rounded-pill px-1.5 py-0.5 text-[11px] font-semibold",
                  active ? "bg-accent text-accent-text" : "bg-chip text-text-2",
                )}
              >
                {counts[l.key].toLocaleString("en-IN")}
              </span>
            </Link>
          );
        })}
      </nav>

      <GoodsReturnAdd type={type} label={LISTS.find((l) => l.key === type)!.label} />

      <form
        // A GET form, so a search is a URL somebody can bookmark and the page
        // stays a server component. `gr` rides along or the search would throw
        // you back to Parties.
        action="/masters"
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="gr" value={type} />
        <input
          name="grq"
          defaultValue={search}
          placeholder={`Search ${LISTS.find((l) => l.key === type)!.label.toLowerCase()}…`}
          className="h-9 min-w-0 flex-1 rounded-field border border-border bg-surface px-2.5 text-[12.5px] text-text-1 outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40 sm:max-w-[280px]"
        />
        <button
          type="submit"
          className="h-9 cursor-pointer rounded-field border border-border bg-surface-2 px-3 text-[12.5px] font-medium text-text-1 hover:bg-chip"
        >
          Search
        </button>
        {search && (
          <Link
            href={href({ grq: undefined })}
            className="text-[12.5px] font-medium text-accent-text underline underline-offset-2"
          >
            Clear
          </Link>
        )}
        <span className="num ml-auto text-[12.5px] text-text-3">
          {list.total.toLocaleString("en-IN")}{" "}
          {list.total === 1 ? "entry" : "entries"}
        </span>
      </form>

      <div className="overflow-hidden rounded-field border border-border">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="w-14 border-b border-border bg-surface-2 px-3.5 pt-2.5 pb-2 text-left text-[11px] font-bold tracking-[0.04em] text-text-3 uppercase">
                #
              </th>
              <th className="border-b border-border bg-surface-2 px-3.5 pt-2.5 pb-2 text-left text-[11px] font-bold tracking-[0.04em] text-text-3 uppercase">
                Name
              </th>
            </tr>
          </thead>
          <tbody className="[&>tr:last-child>td]:border-b-0">
            {list.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={2}
                  className="px-3.5 py-8 text-center text-[13px] text-text-3"
                >
                  {search ? `Nothing matches “${search}”.` : "Nothing here yet."}
                </td>
              </tr>
            ) : (
              list.rows.map((r, i) => (
                <tr key={r.id}>
                  <td className="num border-b border-border px-3.5 py-2 text-text-3">
                    {(list.page - 1) * list.pageSize + i + 1}
                  </td>
                  <td className="border-b border-border px-3.5 py-2 text-text-1">
                    {r.name}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {list.totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="num text-[12px] text-text-3">
            Page {list.page} of {list.totalPages}
          </span>
          <div className="flex gap-2">
            {list.page > 1 && (
              <Link
                href={href({ grpage: String(list.page - 1) })}
                className="h-8 rounded-field border border-border bg-surface px-3 text-[12.5px] leading-8 font-medium text-text-1 hover:bg-surface-2"
              >
                Previous
              </Link>
            )}
            {list.page < list.totalPages && (
              <Link
                href={href({ grpage: String(list.page + 1) })}
                className="h-8 rounded-field border border-border bg-surface px-3 text-[12.5px] leading-8 font-medium text-text-1 hover:bg-surface-2"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
