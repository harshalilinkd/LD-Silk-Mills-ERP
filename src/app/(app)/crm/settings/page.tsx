import { CrmFollowUpsPanel } from "@/components/order-entry/settings/crm-settings";

/**
 * CRM rules → CRM follow-ups, the first tab.
 *
 * It renders HERE rather than redirecting to /crm/settings/follow-ups: the
 * sidebar points at this address, and an entry point that is itself a hop is
 * what made "Order Entry rules" land on Masters.
 *
 * The ADMIN gate is in the layout, so it covers this tab and Rating criteria
 * with one check — see the note there.
 */
export default function CrmFollowUpsPage() {
  return <CrmFollowUpsPanel />;
}
