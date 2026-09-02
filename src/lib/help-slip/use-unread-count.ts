"use client";

import { useQuery } from "@tanstack/react-query";
import { helpSlipGet } from "./api-client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  How Help Slip stays live here, and how the standalone app does it
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The source subscribes to Supabase Realtime, scoped to `user_id=eq.<me>` —
 * a notification row written by a database trigger reaches the phone without
 * a refresh. We are not adding a Supabase client to this shell (CLAUDE.md is
 * explicit: plain Postgres connection, no `@supabase/supabase-js`), so the
 * substitute is the boring one that needs no new dependency:
 *
 *   - `staleTime: 30_000`, matching the source's own figure.
 *   - `refetchOnWindowFocus`, which covers the case that actually matters —
 *     somebody alt-tabs back to the tab they left open on the dashboard.
 *   - a modest interval on THIS query only.
 *
 * 60s, and not shorter. Every poll is a transaction on a pool of five shared
 * with Orders and CRM; at 10s a single idle tab would be six pinned
 * connections a minute for an integer that changes a few times a day. It is
 * also `refetchIntervalInBackground: false` by default, so a tab nobody is
 * looking at stops asking entirely.
 *
 * Note the shell's own QueryProvider sets `refetchOnWindowFocus: false`
 * globally — dense Orders tables people leave open beside a spreadsheet were
 * shuffling rows under the cursor. Help Slip's queries opt back IN
 * individually, because a notification count that is stale on return is the
 * one thing this number must not be.
 */
export const HELP_SLIP_STALE_TIME = 30_000;
const UNREAD_POLL_MS = 60_000;

export function useUnreadCount() {
  const query = useQuery({
    queryKey: ["help-slip", "unread"],
    queryFn: () => helpSlipGet<{ unread: number }>("/api/help-slip/unread"),
    staleTime: HELP_SLIP_STALE_TIME,
    refetchOnWindowFocus: true,
    refetchInterval: UNREAD_POLL_MS,
  });

  // Zero on a failed fetch, never a stale number: the bell says "nothing new"
  // rather than asserting a count it could not confirm.
  return query.data?.unread ?? 0;
}
