"use client";

import { createContext, useContext } from "react";
import type { Capability, Role } from "./rbac";

export type OrderEntrySession = {
  userId: string;
  name: string | null;
  email: string;
  role: Role;
  caps: Capability[];
};

const OrderEntrySessionContext = createContext<OrderEntrySession | null>(null);

export function OrderEntrySessionProvider({
  value,
  children,
}: {
  value: OrderEntrySession;
  children: React.ReactNode;
}) {
  return (
    <OrderEntrySessionContext.Provider value={value}>
      {children}
    </OrderEntrySessionContext.Provider>
  );
}

export function useOrderEntrySession(): OrderEntrySession {
  const ctx = useContext(OrderEntrySessionContext);
  if (!ctx) {
    throw new Error(
      "useOrderEntrySession must be used within OrderEntrySessionProvider",
    );
  }
  return ctx;
}
