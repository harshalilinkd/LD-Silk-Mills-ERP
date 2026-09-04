"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Pager } from "@/components/ui/pager";

/**
 * The shell's `Pager`, wired to the query string.
 *
 * `Pager` takes an `onPageChange` callback because every other list in the ERP
 * holds its page in React state. This one keeps it in the URL — so a link to
 * page 4 of a filtered list is a link somebody can send — and this component is
 * the adapter between the two. It exists so the page itself can stay a server
 * component; only this scrap of it needs to be interactive.
 */
export function ListPager({
  page,
  totalPages,
  total,
  pageSize,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (next: number) => {
    const q = new URLSearchParams(params.toString());
    // Page 1 is the default, so it is left OUT of the URL rather than written
    // as ?page=1 — a canonical address for the first page, and one fewer thing
    // in a link somebody pastes into WhatsApp.
    if (next <= 1) q.delete("page");
    else q.set("page", String(next));
    router.push(`${pathname}?${q.toString()}`, { scroll: true });
  };

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="num text-[12px] text-text-3">
        Showing {first.toLocaleString("en-IN")}–{last.toLocaleString("en-IN")} of{" "}
        {total.toLocaleString("en-IN")}
      </span>
      <Pager page={page} totalPages={totalPages} onPageChange={go} />
    </div>
  );
}
