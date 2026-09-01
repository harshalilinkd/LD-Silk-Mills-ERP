import { IconSettings } from "@tabler/icons-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
        Settings
      </h1>
      <ComingSoon
        icon={IconSettings}
        title="Settings — coming soon"
        description="Workspace preferences will live here in a later phase."
      />
    </div>
  );
}
