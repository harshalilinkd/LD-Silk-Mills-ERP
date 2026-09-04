import { CrmRatingCriteriaPanel } from "@/components/order-entry/settings/crm-settings";

/**
 * CRM rules → Rating criteria.
 *
 * This used to sit below the follow-up knobs on one scrolling page, so it was
 * below the fold on every laptop. The ADMIN gate is in the layout.
 */
export default function CrmRatingCriteriaPage() {
  return <CrmRatingCriteriaPanel />;
}
