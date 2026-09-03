import { IconLock } from "@tabler/icons-react";
import Link from "next/link";

import { getErpRole } from "@/lib/admin";

/**
 * The gate on every `/admin/*` page.
 *
 * Until now there was none: these three screens sat behind nothing but
 * `middleware.ts`'s "are you signed in", so any employee could open the
 * access-control grid and tick themselves into Order Entry.
 *
 * THIS IS NOT THE BOUNDARY, and it matters that it is not. A server action is
 * a POST endpoint that does not care which page the caller was looking at, so
 * every mutating action under `/admin` calls `requireErpAdmin()` itself. This
 * layout exists so a non-admin gets an honest sentence instead of a form that
 * will reject them — and, before this, instead of a raw 500 from the throw.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = await getErpRole();

  if (role !== "admin") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-status-amber-dim">
          <IconLock className="size-6 text-status-amber" />
        </div>
        <h1 className="text-lg font-semibold tracking-[-0.01em] text-text-1">
          Administrators only
        </h1>
        <p className="max-w-sm text-sm text-text-3">
          These screens manage accounts, module access and the system registry.
          Ask an ERP administrator if you need something changed.
        </p>
        <Link
          href="/"
          className="text-[13px] text-accent-text underline underline-offset-2"
        >
          Back to the dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
