import { AdminThemeShell } from "../AdminThemeShell";
import { AdminShell } from "./AdminShell";

export default function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminThemeShell>
      <AdminShell>{children}</AdminShell>
    </AdminThemeShell>
  );
}
