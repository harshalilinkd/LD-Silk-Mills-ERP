import { IconRoute } from "@tabler/icons-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function OperationsTrackingPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
        Operations
      </h1>
      <ComingSoon
        icon={IconRoute}
        title="Operations tracking — coming soon"
        description="The 7-stage tick/untick board for tracking each design through production is planned for a follow-up phase."
      />
    </div>
  );
}
