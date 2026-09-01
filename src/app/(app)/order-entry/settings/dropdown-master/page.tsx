import { IconList } from "@tabler/icons-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function DropdownMasterPage() {
  return (
    <ComingSoon
      icon={IconList}
      title="Dropdown Master — coming soon"
      description="Manage the autocomplete lists (party, sales person, agent, haste, transport, fabric, CRM categories) here."
    />
  );
}
