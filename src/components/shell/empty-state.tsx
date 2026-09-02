import type { ComponentType, ReactNode } from "react";

// `title`/`description` are ReactNode rather than string so a caller can pass
// a bilingual label — Help Slip renders "You're all clear. (सब ठीक है।)" as an
// English string with a smaller Devanagari gloss inside it, which is a node,
// not a string. Widening is backwards-compatible: every existing caller passes
// a string, and a string is a ReactNode.
export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-5 py-11 text-center text-text-3">
      <Icon className="size-[30px] text-text-3" />
      <p className="text-[13.5px] font-semibold text-text-2">{title}</p>
      {description && (
        <p className="max-w-[260px] text-xs text-text-3">{description}</p>
      )}
    </div>
  );
}
