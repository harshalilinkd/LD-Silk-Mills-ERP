import { IconClock } from "@tabler/icons-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function TimeTrackingSettingsPage() {
  return (
    <ComingSoon
      icon={IconClock}
      title="Time tracking — coming soon"
      description="Edit each of the 7 workflow stages' SLA offset (planned days from order date) and trigger a recompute."
    />
  );
}
