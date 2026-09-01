import { IconAdjustments } from "@tabler/icons-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function CrmSettingsPage() {
  return (
    <ComingSoon
      icon={IconAdjustments}
      title="CRM settings — coming soon"
      description="Tune transit days, follow-up due days, max attempts, escalation threshold, and rating criteria."
    />
  );
}
