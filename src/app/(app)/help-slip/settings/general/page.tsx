import { redirect } from "next/navigation";

/**
 * Moved up one level — Help Slip rules is now this screen and nothing else,
 * so it renders at /help-slip/settings itself.
 *
 * Kept as a redirect rather than deleted: this was a real address people
 * bookmarked, and a 404 on a settings screen reads as "the feature was
 * removed" rather than "it is somewhere better now".
 */
export default function MovedPage() {
  redirect("/help-slip/settings");
}
