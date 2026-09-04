"use client";

import * as React from "react";

import type { GoodsReturnOffice } from "@/lib/goods-return/offices";

/**
 * The office a person is working as, for the client components that need it.
 *
 * Server components read `getChosenOffice()` directly; this exists only so a
 * client component — the office badge in the header, a form deciding whether to
 * show a Head-Office-only control — can ask without a round trip or a prop
 * threaded through four levels.
 *
 * It carries NO authority. See the header of `src/lib/goods-return/authz.ts`:
 * anyone who can open the module can switch office at will, so this value
 * shapes what is displayed and never what is permitted. Every write re-checks
 * on the server.
 */
export type GoodsReturnSession = {
  office: GoodsReturnOffice;
  userId: string;
  name: string;
};

const Ctx = React.createContext<GoodsReturnSession | null>(null);

export function GoodsReturnProvider({
  value,
  children,
}: {
  value: GoodsReturnSession;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGoodsReturn(): GoodsReturnSession {
  const v = React.useContext(Ctx);
  if (!v) {
    throw new Error("useGoodsReturn must be used inside GoodsReturnProvider");
  }
  return v;
}
