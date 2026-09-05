"use client";

import * as React from "react";

/**
 * Who is looking, for the client components below the layout.
 *
 * A MIRROR OF A SERVER DECISION, NEVER THE DECISION ITSELF. `isAdmin` here
 * decides whether a button is drawn; `requireChecklistAdmin()` on the server
 * decides whether pressing it does anything. Anybody can edit this value in
 * their own browser and reveal every button on the screen — and every one of
 * them will be refused. Never gate anything that matters on this.
 *
 * The shape is deliberately the same as the server's `ChecklistViewer` minus
 * nothing: there is nothing sensitive in it, and keeping the two identical
 * means a screen reads the same field name whichever side it is rendered on.
 */
export type ChecklistViewerValue = {
  userId: string;
  name: string;
  email: string;
  doerId: number | null;
  doerName: string | null;
  department: string | null;
  isAdmin: boolean;
  viaShellAdmin: boolean;
};

const Ctx = React.createContext<ChecklistViewerValue | null>(null);

export function ChecklistProvider({
  value,
  children,
}: {
  value: ChecklistViewerValue;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChecklistViewer(): ChecklistViewerValue {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useChecklistViewer used outside the Checklist layout");
  return v;
}
