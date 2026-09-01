import { IconUsers } from "@tabler/icons-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function CrmCustomersPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
        Customers
      </h1>
      <ComingSoon
        icon={IconUsers}
        title="Customers — coming soon"
        description="A read-only roll-up of customer history derived from orders and follow-ups is planned for a follow-up phase."
      />
    </div>
  );
}
