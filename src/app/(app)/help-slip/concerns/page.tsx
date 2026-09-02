import { Suspense } from "react";

import { ListFallback } from "@/components/help-slip/fallback";
import { MyConcerns } from "@/components/help-slip/my-concerns";

/**
 * My Concerns — the employee's own list, and reachable by staff too.
 *
 * Not gated on role, deliberately: a coordinator has a leaking fridge and a
 * laptop that will not charge like anybody else, and the standalone app moved
 * this into the main nav for exactly that reason. RLS scopes it to the
 * caller's own rows whoever they are.
 *
 * Suspended because the screen reads its whole filter state out of
 * `useSearchParams`, which Next requires be wrapped.
 */
export default function HelpSlipConcernsPage() {
  return (
    <Suspense fallback={<ListFallback />}>
      <MyConcerns />
    </Suspense>
  );
}
