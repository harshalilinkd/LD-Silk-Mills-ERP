import { Suspense } from "react";

import { ConcernDetail } from "@/components/help-slip/concern-detail";
import { ListFallback } from "@/components/help-slip/fallback";

/**
 * ONE concern — the employee's view. A real URL, refresh-safe, and where a
 * WhatsApp deep link and a notification both land.
 *
 * NOT gated on role, and there is nothing to gate: the route behind it answers
 * a concern you may not read with a 200 and `null`, because RLS returns zero
 * rows rather than raising. A guessed uuid, a typo'd one and a colleague's
 * confidential complaint are indistinguishable from here, and the screen
 * renders the same "Not found" for all three. Adding a check in this file
 * would only invent a second, different answer.
 *
 * Suspended because the screen reads the notification deep-link target out of
 * `useSearchParams`, which Next requires be wrapped.
 */
export default async function HelpSlipConcernDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={<ListFallback />}>
      <ConcernDetail id={id} />
    </Suspense>
  );
}
