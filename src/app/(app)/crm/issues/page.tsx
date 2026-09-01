import { IconAlertTriangle } from "@tabler/icons-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function CrmIssuesPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
        Issues
      </h1>
      <ComingSoon
        icon={IconAlertTriangle}
        title="Issues board — coming soon"
        description="Complaint triage and resolution tracking are planned for a follow-up phase."
      />
    </div>
  );
}
