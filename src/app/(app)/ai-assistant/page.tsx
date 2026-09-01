import { IconSparkles } from "@tabler/icons-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function AiAssistantPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-text-1">
        AI Assistant
      </h1>
      <ComingSoon
        icon={IconSparkles}
        title="AI Assistant — coming soon"
        description="A workspace-wide assistant is planned for a later phase."
      />
    </div>
  );
}
