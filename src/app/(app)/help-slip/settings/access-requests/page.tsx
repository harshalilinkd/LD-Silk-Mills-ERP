import { redirect } from "next/navigation";

/**
 * Moved — access requests are in ERP Settings
 *
 * Deciding who joins the company's systems is the same job as the People tab
 * beside it, not a rule of Help Slip. The panel and its API are unchanged;
 * only the address is.
 *
 * Kept as a redirect rather than deleted: this was a real address people
 * bookmarked, and a 404 on a settings screen reads as "the feature was
 * removed" rather than "it is somewhere better now".
 */
export default function MovedPage() {
  redirect("/settings/access-requests");
}
