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
    <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-accent">
        <Icon className="size-6 text-accent-foreground" />
      </div>
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
