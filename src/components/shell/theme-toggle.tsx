"use client";

import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "ld-erp-theme";

// Initial state assumes dark — matches the blocking script in
// src/app/layout.tsx, which also defaults to dark when nothing is stored
// yet. Keeping this assumption in sync with that script's default is what
// keeps the server-rendered icon and the client's first hydration pass
// identical (no mismatch warning); the useEffect below then corrects it
// immediately on mount for the rare visitor who has actually chosen light.
export function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Private browsing / storage disabled — theme just won't persist.
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="size-9 rounded-lg text-text-2 hover:bg-surface-2 hover:text-text-1"
    >
      {isDark ? (
        <IconSun className="size-[18px]" />
      ) : (
        <IconMoon className="size-[18px]" />
      )}
    </Button>
  );
}
