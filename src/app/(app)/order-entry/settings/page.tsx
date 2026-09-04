import { redirect } from "next/navigation";

/**
 * Lands on the first real tab.
 *
 * This pointed at `dropdown-master` until that screen moved to Masters — and
 * because the old address was kept as a redirect, clicking "Order Entry rules"
 * in the sidebar went settings -> dropdown-master -> /masters. A chained
 * redirect through a page that no longer belongs to this section.
 *
 * If a tab is ever moved out again, check this line: a redirect that lands on
 * another redirect is invisible in the code and obvious to whoever clicks it.
 */
export default function OrderEntrySettingsIndexPage() {
  redirect("/order-entry/settings/design-database");
}
