"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Lock, Mail } from "lucide-react";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AdminThemeShell } from "../AdminThemeShell";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || password.length < 6) {
      setError("Renseignez un e-mail et un mot de passe (6 caractères min.).");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: signError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signError) {
        setError(
          signError.message === "Invalid login credentials"
            ? "E-mail ou mot de passe incorrect."
            : signError.message
        );
        return;
      }
      router.push("/admin");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminThemeShell>
      <div className="relative min-h-screen overflow-hidden bg-[#0a1628] text-white">
        <motion.div
          className="pointer-events-none absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-[var(--nci-navy)]/30 blur-3xl"
          aria-hidden
        />
        <motion.div
          className="pointer-events-none absolute -right-32 bottom-1/4 h-96 w-96 rounded-full bg-[var(--nci-orange)]/20 blur-3xl"
          aria-hidden
        />

        <header className="relative z-10 border-b border-white/10 bg-black/40 backdrop-blur-lg">
          <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-[var(--nci-orange)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour au jeu
            </Link>
          </div>
        </header>

        <main className="relative z-10 flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full max-w-md"
          >
            <div className="mb-8 text-center">
              <Image
                src="/images/logo_nci.png"
                alt="NCI"
                width={180}
                height={56}
                className="mx-auto mb-4 h-12 w-auto object-contain"
                priority
              />
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--nci-orange)]">
                Administration
              </p>
              <p className="mt-3 text-sm text-zinc-400">
                Tableau de bord — stats et pilotage du sondage.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-sm sm:p-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-sm text-red-200">
                    {error}
                  </p>
                )}
                <div className="space-y-2">
                  <label
                    htmlFor="admin-email"
                    className="text-xs font-medium uppercase tracking-wide text-zinc-400"
                  >
                    E-mail
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <input
                      id="admin-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/30 py-3 pl-10 pr-4 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-[var(--nci-navy)]/60 focus:ring-2 focus:ring-[var(--nci-navy)]/25"
                      placeholder="admin@exemple.com"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="admin-password"
                    className="text-xs font-medium uppercase tracking-wide text-zinc-400"
                  >
                    Mot de passe
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <input
                      id="admin-password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/30 py-3 pl-10 pr-4 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-[var(--nci-navy)]/60 focus:ring-2 focus:ring-[var(--nci-navy)]/25"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full cursor-pointer rounded-xl bg-[var(--nci-navy)] py-3 text-sm font-semibold text-white transition hover:bg-[var(--nci-navy-hover)] disabled:opacity-60"
                >
                  {loading ? "Connexion…" : "Se connecter"}
                </button>
              </form>
            </div>
          </motion.div>
        </main>
      </div>
    </AdminThemeShell>
  );
}
