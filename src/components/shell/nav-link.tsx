"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-[11px] rounded-lg border px-2.5 py-2 text-[13.5px] font-medium transition-colors",
        active
          ? "border-primary/20 bg-accent text-accent-text"
          : "border-transparent text-text-2 hover:bg-surface-2 hover:text-text-1",
      )}
    >
      <span className="flex [&_svg]:size-4 [&_svg]:shrink-0">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
    </Link>
  );
}
