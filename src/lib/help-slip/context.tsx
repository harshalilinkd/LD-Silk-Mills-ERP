"use client";

import { createContext, useContext } from "react";
import type { UserRole } from "@/db/help-slip/schema";

/**
 * The Help Slip identity, handed from the route group's server layout down to
 * the client screens. Same shape and same reasoning as
 * `src/lib/order-entry/context.tsx`.
 *
 * ⚠️ RENDERING HINTS ONLY. `role` and `hrAccess` decide which nav item and
 * which button to draw, and nothing else. Help Slip's authorization lives
 * entirely in RLS and is applied by `withHelpSlip()` on the server — so if a
 * screen forgets to hide a control, the worst case is a failed write, never a
 * disclosure. Do not add a check here and call it a permission.
 *
 * There is no `profileId` on this type on purpose: a client component has no
 * use for it (every query is already scoped by the server's RLS context), and
 * shipping it invites somebody to send it up as a parameter.
 */
export type HelpSlipClientSession = {
  fullName: string;
  email: string;
  role: UserRole;
  /** Read-only rendering hint. The real gate is the RLS policy. */
  hrAccess: boolean;
  departmentId: string | null;
  locale: string;
};

const HelpSlipSessionContext = createContext<HelpSlipClientSession | null>(
  null,
);

export function HelpSlipSessionProvider({
  value,
  children,
}: {
  value: HelpSlipClientSession;
  children: React.ReactNode;
}) {
  return (
    <HelpSlipSessionContext.Provider value={value}>
      {children}
    </HelpSlipSessionContext.Provider>
  );
}

export function useHelpSlipSession(): HelpSlipClientSession {
  const ctx = useContext(HelpSlipSessionContext);
  if (!ctx) {
    throw new Error(
      "useHelpSlipSession must be used within HelpSlipSessionProvider",
    );
  }
  return ctx;
}
