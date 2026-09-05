import { redirect } from "next/navigation";
import { IconLock } from "@tabler/icons-react";

import { auth } from "@/auth";
import { capabilitiesOf, resolvePettyCashViewer } from "@/lib/petty-cash/authz";
import { PettyCashProvider } from "./viewer-context";

/**
 * Petty Cash.
 *
 * ONE GATE HERE, AND IT IS THE REAL ONE. `resolvePettyCashViewer()` reads
 * `ld_erp_core.system_access` — the tick box in Settings → Access — on the
 * SERVER. Hiding a sidebar link is never a permission, and this module holds
 * the company's cash position.
 *
 * What somebody may DO once inside is not gated here: a viewer is meant to
 * open the module and read it. Every mutation re-checks its own capability
 * server-side, in `lib/petty-cash/authz.ts`, before reading an argument.
 */
export default async function PettyCashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const viewer = await resolvePettyCashViewer();

  if (!viewer) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-status-amber-dim">
          <IconLock className="size-6 text-status-amber" />
        </div>
        <h1 className="text-lg font-semibold tracking-[-0.01em] text-text-1">
          Not provisioned for Petty Cash
        </h1>
        <p className="max-w-sm text-sm text-text-3">
          Your ERP account ({session.user.email}) has not been given Petty Cash.
          An administrator can tick it in Settings → Access.
        </p>
      </div>
    );
  }

  return (
    <PettyCashProvider
      value={{
        userId: viewer.userId,
        name: viewer.name,
        role: viewer.role,
        viaShellAdmin: viewer.viaShellAdmin,
        can: capabilitiesOf(viewer),
      }}
    >
      {children}
    </PettyCashProvider>
  );
}
