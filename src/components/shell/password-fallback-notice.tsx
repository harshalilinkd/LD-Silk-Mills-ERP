import Link from "next/link";
import { IconKey } from "@tabler/icons-react";

import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  "Google is your only way in"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ten of the eleven people here can sign in with Google and nothing else. That
 * is not a fault — it is simply how everybody signed up, and it works every
 * day. It becomes a fault on exactly one kind of day: Google unreachable, the
 * OAuth client changed or its consent screen expired, or one person's Google
 * account suspended by their own IT. On that day they have no second way in
 * AND NO WAY TO MAKE ONE, because setting a password requires being signed in
 * already. The lockout and the cure need the same key.
 *
 * The cheap fix is the person setting their own password, not an admin typing
 * ten of them and reading them out over WhatsApp — a password the admin never
 * knows is a better password, and ten passwords on one screen is a screenshot
 * waiting to happen. So this asks the person, on their own dashboard, where
 * they already are.
 *
 * ── WHY IT DOES NOT DISMISS ───────────────────────────────────────────────
 *
 * A dismiss button on a one-off setup task is a way to never do it, and the
 * thing it protects against does not go away when the strip is hidden. It
 * disappears the moment a password exists, which is the only honest way to
 * close it. It is a slim strip and not a modal for the same reason: it must
 * not stand between somebody and their work.
 *
 * ── IT COSTS ONE COLUMN ON ONE ROW ────────────────────────────────────────
 *
 * `password_set_at` for the signed-in user only. It renders nothing at all for
 * the people who have already done it, and nothing for a session with no email
 * — never an error, because a notice that can break the dashboard is worse
 * than the risk it describes.
 */
export async function PasswordFallbackNotice() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  let hasPassword = true;
  try {
    const [row] = await db
      .select({ passwordSetAt: users.passwordSetAt })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    // No row means no ERP account, which is a different problem and not this
    // strip's to raise. Assume nothing needs saying.
    if (!row) return null;
    hasPassword = row.passwordSetAt !== null;
  } catch {
    return null;
  }
  if (hasPassword) return null;

  return (
    <div className="flex flex-col gap-2 rounded-card border border-status-amber/30 bg-status-amber-dim px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <IconKey className="size-5 shrink-0 text-status-amber" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-status-amber">
          Google is your only way to sign in
        </p>
        <p className="mt-0.5 text-[12.5px] text-text-2">
          Add a password as a backup. It takes a few seconds, and it means you
          can still get in on a day Google will not let you — when you could no
          longer set one.
        </p>
      </div>
      <Link
        href="/settings"
        className="shrink-0 self-start rounded-[8px] bg-status-amber px-3 py-1.5 text-[12.5px] font-semibold text-white sm:self-auto"
      >
        Set a password
      </Link>
    </div>
  );
}
