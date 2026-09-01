import {
  IconClipboardList,
  IconLifebuoy,
  IconReceipt2,
  IconTargetArrow,
  IconUsersGroup,
  IconTruckReturn,
  IconCashBanknote,
  IconHeadset,
  IconApps,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

/** Fallback icon per system_code when systems.icon isn't set in the DB yet. */
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "order-entry": IconClipboardList,
  "help-slip": IconLifebuoy,
  crr: IconReceipt2,
  nbd: IconTargetArrow,
  crm: IconUsersGroup,
  scot: IconHeadset,
  "goods-return-lr": IconTruckReturn,
  "petty-cash": IconCashBanknote,
};

export function getSystemIcon(systemCode: string) {
  return ICONS[systemCode] ?? IconApps;
}
