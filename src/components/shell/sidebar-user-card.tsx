function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function SidebarUserCard({
  name,
  email,
  avatar,
}: {
  name: string;
  email: string;
  avatar: string | null;
}) {
  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="flex items-center gap-2.5 rounded-lg p-2">
        <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border-strong bg-surface-3 text-xs font-bold text-accent-text">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt={name} className="size-full object-cover" />
          ) : (
            initials(name)
          )}
        </div>
        <div className="min-w-0 overflow-hidden whitespace-nowrap">
          <div className="truncate text-[13px] font-semibold text-text-1">
            {name}
          </div>
          <div className="truncate text-[11.5px] text-text-3">{email}</div>
        </div>
      </div>
    </div>
  );
}
