"use client";

import { ThemeProvider } from "next-themes";

export function AdminThemeShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" forcedTheme="dark" enableSystem={false}>
      <div className="admin-root min-h-screen text-zinc-100">{children}</div>
    </ThemeProvider>
  );
}
