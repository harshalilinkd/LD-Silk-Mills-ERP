/**
 * The office vocabulary — dependency-free, and safe to import from ANYWHERE.
 *
 * No `server-only`, no `next/headers`, no database. That is the entire point of
 * the file, and it exists because of a real breakage rather than tidiness: the
 * office badge is a client component, it imported `OFFICE_LABEL` from
 * `./authz`, and that dragged a module marked `server-only` into the browser
 * bundle. Next refused to compile it — and not just this module: the poisoned
 * import graph took `/order-entry/order-status` down with a 500 too.
 *
 * TypeScript cannot catch it. `tsc --noEmit` passes cleanly on that import
 * because it is a perfectly valid type-level reference; the constraint is the
 * bundler's, and it only shows up when a page is actually requested.
 *
 * The standalone app had already learned this and split `lib/roles.ts` out for
 * the same reason, with the comment "Safe to import from edge (middleware) and
 * server code alike". This is that file.
 *
 * RULE: anything a client component needs to know about offices goes HERE.
 * Anything that reads a cookie, a session or the database stays in `./authz`.
 */

export type GoodsReturnOffice = "head_office" | "bhiwandi";

export const OFFICES: GoodsReturnOffice[] = ["head_office", "bhiwandi"];

export const OFFICE_LABEL: Record<GoodsReturnOffice, string> = {
  head_office: "Head Office",
  bhiwandi: "Bhiwandi Office",
};

/** Narrows an untrusted string — a cookie value, a form field. */
export function parseOffice(raw: string | null | undefined): GoodsReturnOffice | null {
  return raw === "head_office" || raw === "bhiwandi" ? raw : null;
}

/**
 * The capability matrix, read out of the standalone app's `allowedRolesFor()`
 * and preserved exactly:
 *
 *   dashboard · all returns · detail · reports   both offices
 *   create a return, edit a return               Head Office only
 *   receiving (mark received)                    both offices
 *   master data                                  Head Office only
 *
 * NONE OF THESE IS A SECURITY BOUNDARY. Anybody who can open the module can
 * switch office at will — the owner's explicit decision, mirroring the
 * standalone app whose two cards sit on a public page with no password. They
 * decide which screens and buttons a person is SHOWN while working as an
 * office; they decide nothing about who is trustworthy. Never write a check
 * that assumes a Bhiwandi session could not have been Head Office a moment ago.
 *
 * The standalone app had a third role, `kalbadevi`, which also labelled as
 * "Head Office" but could not reach master data. It is not reproduced: nothing
 * ever granted it through the office chooser, and two offices is what the
 * business has. The enum value still exists in the live database and the schema
 * mirror still models it, so an old row reads fine.
 */
export const canCreateReturns = (o: GoodsReturnOffice) => o === "head_office";
export const canEditReturns = (o: GoodsReturnOffice) => o === "head_office";
export const canManageMasters = (o: GoodsReturnOffice) => o === "head_office";

/**
 * Both offices, deliberately — Head Office receives too, and the standalone app
 * allowed it. Written to take no argument rather than to ignore one, so nobody
 * reads an unused parameter as an oversight and "fixes" it into a restriction.
 */
export const canReceive = () => true;

/** Where each office lands, straight after choosing. */
export function homePathForOffice(office: GoodsReturnOffice): string {
  return office === "bhiwandi" ? "/goods-return/receiving" : "/goods-return";
}
