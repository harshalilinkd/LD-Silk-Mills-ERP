import { IconSettings } from "@tabler/icons-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function SettingsPage() {
  return (
    <ComingSoon
      icon={IconSettings}
      title="Settings coming soon"
      description="Personal preferences and workspace settings will live here."
    />
  );
}
