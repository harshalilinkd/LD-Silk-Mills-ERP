import { withHelpSlipRoute } from "@/lib/help-slip/api";
import { countUnreadNotifications } from "@/lib/help-slip/queries";

/**
 * GET /api/help-slip/unread — the bell's number, and nothing else.
 *
 * ── WHY THIS IS A POLL ────────────────────────────────────────────────────
 * The standalone app keeps this live with a Supabase Realtime subscription
 * filtered to `user_id=eq.<me>`. This shell has no Supabase client and is not
 * getting one (CLAUDE.md: plain Postgres connection, no
 * `@supabase/supabase-js`), so the closest honest equivalent is TanStack
 * Query's `refetchOnWindowFocus` plus a modest interval — see
 * `use-unread-count.ts` for the interval and why it is not shorter.
 *
 * It is deliberately the ONE thing on its own route. Everything else a screen
 * needs is batched into that screen's single request, but the count keeps
 * ticking while the reader sits on a page, and re-running a dashboard
 * aggregate every minute to refresh one integer would be absurd. It is a
 * single indexed count on one connection.
 */
export async function GET() {
  return withHelpSlipRoute(
    "GET /api/help-slip/unread",
    async (db, session) => ({
      unread: await countUnreadNotifications(db, session),
    }),
    "Could not check for new notifications.",
  );
}
