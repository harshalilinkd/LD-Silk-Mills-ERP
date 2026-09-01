import { IconPhoneCall } from "@tabler/icons-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function CrmFollowupsPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
        CRM
      </h1>
      <ComingSoon
        icon={IconPhoneCall}
        title="Follow-up queue — coming soon"
        description="Post-delivery follow-up calls, ratings, and reorder tracking are planned for a follow-up phase."
      />
    </div>
  );
}
