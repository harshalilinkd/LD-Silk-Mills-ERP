import { IconTrash } from "@tabler/icons-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function OrderEntryTrashPage() {
  return (
    <ComingSoon
      icon={IconTrash}
      title="Trash — coming soon"
      description="Restore or permanently purge soft-deleted orders and designs."
    />
  );
}
