import { IconChartBar } from "@tabler/icons-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function CrmAnalyticsPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
        CRM analytics
      </h1>
      <ComingSoon
        icon={IconChartBar}
        title="CRM analytics — coming soon"
        description="Aggregate charts over follow-up performance are planned for a follow-up phase."
      />
    </div>
  );
}
