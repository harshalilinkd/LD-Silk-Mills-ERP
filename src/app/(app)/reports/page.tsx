import { IconReportAnalytics } from "@tabler/icons-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
        Reports
      </h1>
      <ComingSoon
        icon={IconReportAnalytics}
        title="Reports — coming soon"
        description="Cross-system reporting is planned once more modules are connected."
      />
    </div>
  );
}
