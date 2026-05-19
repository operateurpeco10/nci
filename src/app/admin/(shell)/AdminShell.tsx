"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  History,
  Vote,
  X,
} from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const nav = [
  { href: "/admin", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/admin/payments", label: "Paiements", icon: CreditCard },
  { href: "/admin/sondage", label: "Sondage", icon: Vote },
  { href: "/admin/historique", label: "Historique", icon: History },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  };

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {nav.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "bg-[var(--nci-navy)]/40 text-[var(--nci-orange)]"
                : "text-zinc-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {label}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="admin-root flex min-h-screen overflow-x-hidden bg-[#0a1628]">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-black/50 md:fixed md:inset-y-0 md:flex">
        <div className="flex h-16 items-center border-b border-white/10 px-4">
          <Image
            src="/images/logo_nci.png"
            alt="NCI"
            width={140}
            height={44}
            className="h-9 w-auto object-contain"
            priority
          />
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          <NavLinks />
        </nav>
        <div className="border-t border-white/10 p-3">
          <Link
            href="/"
            className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <ExternalLink className="h-4 w-4" />
            Voir le jeu
          </Link>
          <button
            type="button"
            onClick={logout}
            className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col md:pl-64">
        <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-white/10 bg-[#0a1628]/95 px-4 backdrop-blur md:hidden">
          <Image
            src="/images/logo_nci.png"
            alt="NCI"
            width={120}
            height={38}
            className="h-8 w-auto object-contain"
            priority
          />
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="cursor-pointer rounded-lg p-2 text-zinc-300 hover:bg-white/10"
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-6 w-6" />
          </button>
        </header>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              className="absolute inset-0 cursor-pointer bg-black/70"
              aria-label="Fermer"
              onClick={() => setMobileOpen(false)}
            />
            <div className="absolute right-0 top-0 flex h-full w-[min(100%,280px)] flex-col border-l border-white/10 bg-[#0a1628] shadow-2xl">
              <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
                <span className="text-sm font-semibold text-[var(--nci-orange)]">
                  Menu
                </span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="cursor-pointer rounded-lg p-2 hover:bg-white/10"
                  aria-label="Fermer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="flex flex-col gap-1 p-3">
                <NavLinks onNavigate={() => setMobileOpen(false)} />
              </nav>
              <div className="mt-auto border-t border-white/10 p-3">
                <Link
                  href="/"
                  className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-zinc-400"
                  onClick={() => setMobileOpen(false)}
                >
                  <ExternalLink className="h-4 w-4" />
                  Voir le jeu
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-300"
                >
                  <LogOut className="h-4 w-4" />
                  Déconnexion
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 pb-10 pt-20 md:px-6 md:pt-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
