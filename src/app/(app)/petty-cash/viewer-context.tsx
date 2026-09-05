"use client";

import * as React from "react";

import type { PettyCashCapabilities } from "@/lib/petty-cash/authz";
import type { MemberRole } from "@/db/petty-cash/schema";

/**
 * Who is looking, for the client components below the layout.
 *
 * A MIRROR OF A SERVER DECISION, NEVER THE DECISION. `can.delete` here decides
 * whether a button is drawn; `requirePettyCashDelete()` on the server decides
 * whether pressing it does anything. Anybody can edit this value in their own
 * browser and reveal every button on the screen — and every one of them will
 * be refused. Nothing that matters is gated on this.
 *
 * There is nothing sensitive in it, which is the other half of why it is safe
 * to ship: a role name and four booleans the person already knows by trying.
 */
export type PettyCashViewerValue = {
  userId: string;
  name: string;
  role: MemberRole;
  /** True when their powers come only from being an ERP administrator. */
  viaShellAdmin: boolean;
  can: PettyCashCapabilities;
};

const Ctx = React.createContext<PettyCashViewerValue | null>(null);

export function PettyCashProvider({
  value,
  children,
}: {
  value: PettyCashViewerValue;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePettyCashViewer(): PettyCashViewerValue {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("usePettyCashViewer used outside the Petty Cash layout");
  return v;
}
