import type { ComponentType } from "react";

export function ComingSoon({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[10px] border border-border bg-surface px-[30px] py-[60px] text-center">
      <Icon className="mx-auto size-[34px] text-text-3" />
      <h3 className="mt-3.5 text-[15px] font-semibold text-text-1">
        {title}
      </h3>
      <p className="mt-1.5 text-[12.5px] text-text-3">{description}</p>
    </div>
  );
}
