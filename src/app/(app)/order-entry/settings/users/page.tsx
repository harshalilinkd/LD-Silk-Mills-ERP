import { redirect } from "next/navigation";

/**
 * Moved — one People screen for all systems
 *
 * Kept as a redirect rather than deleted: these were real addresses people
 * bookmarked and linked to, and a 404 on a settings screen reads as "the
 * feature was removed" rather than "it is somewhere better now".
 */
export default function MovedPage() {
  redirect("/settings/users");
}
