import { IconHistory } from "@tabler/icons-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function CrmCallsPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
        Call log
      </h1>
      <ComingSoon
        icon={IconHistory}
        title="Call log — coming soon"
        description="A read-only record of every follow-up contact attempt, feedback, and score is planned for a follow-up phase."
      />
    </div>
  );
}
