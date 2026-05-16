"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className="h-9 w-[3.25rem] shrink-0 rounded-full bg-zinc-200/80 dark:bg-white/10"
        aria-hidden
      />
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Passer au thème clair" : "Passer au thème sombre"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative inline-flex h-9 w-[3.25rem] shrink-0 cursor-pointer items-center rounded-full border border-zinc-200/90 bg-zinc-100 p-0.5 transition-colors dark:border-white/10 dark:bg-white/5"
    >
      <span
        className={`pointer-events-none absolute left-0.5 top-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-zinc-900/5 transition-transform duration-300 dark:bg-zinc-800 dark:ring-white/10 ${isDark ? "translate-x-[1.35rem]" : "translate-x-0"}`}
      >
        {isDark ? (
          <MoonIcon className="h-4 w-4 text-amber-200/90" />
        ) : (
          <SunIcon className="h-4 w-4 text-amber-500" />
        )}
      </span>
      <span className="sr-only">
        {isDark ? "Thème sombre" : "Thème clair"}
      </span>
    </button>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
