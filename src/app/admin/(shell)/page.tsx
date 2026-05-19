"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

type ChoiceStat = {
  id: string;
  label: string;
  votes: number;
};

type StatsPayload = {
  choices: ChoiceStat[];
  totalVotes: number;
  totalRevenueFcfa: number;
  completedPayments: number;
  failedPayments: number;
  pendingPayments: number;
  responsesLast24h: number;
  walletRevenue: { walletId: string; label: string; amountFcfa: number }[];
  votesClosedDb: boolean;
  votesClosedEnv: boolean;
};

function formatFcfa(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      if (!res.ok) throw new Error("Chargement impossible");
      setStats((await res.json()) as StatsPayload);
    } catch {
      setError("Impossible de charger les statistiques.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const maxTotal = Math.max(
    ...(stats?.choices.map((c) => c.votes) ?? [1]),
    1
  );

  return (
    <div className="w-full space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Tableau de bord</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Résultats du sondage et activité paiements.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {stats && (
        <>
          {(stats.votesClosedDb || stats.votesClosedEnv) && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Votes fermés
              {stats.votesClosedEnv ? " (variable d’environnement)" : ""}
              {stats.votesClosedDb ? " (réglage base)" : ""}.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Votes totaux" value={String(stats.totalVotes)} />
            <KpiCard
              label="Paiements réussis"
              value={String(stats.completedPayments)}
            />
            <KpiCard label="CA (FCFA)" value={formatFcfa(stats.totalRevenueFcfa)} />
            <KpiCard
              label="Votes crédités (24 h)"
              value={String(stats.responsesLast24h)}
            />
          </div>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">
              Résultats du sondage
            </h2>
            <div className="space-y-5">
              {stats.choices.map((c, i) => {
                const pct = Math.round((c.votes / maxTotal) * 100);
                const barColor =
                  i === 0 ? "bg-[var(--nci-green)]" : "bg-[var(--nci-orange)]";
                return (
                  <div key={c.id}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium text-white">{c.label}</span>
                      <span className="text-zinc-400">
                        {c.votes} vote{c.votes !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full ${barColor} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {stats.walletRevenue.length > 0 && (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="mb-4 text-lg font-semibold text-white">
                CA par portefeuille
              </h2>
              <ul className="divide-y divide-white/10">
                {stats.walletRevenue.map((w) => (
                  <li
                    key={w.walletId}
                    className="flex justify-between py-3 text-sm"
                  >
                    <span className="text-zinc-300">{w.label}</span>
                    <span className="font-medium text-white">
                      {formatFcfa(w.amountFcfa)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-xs text-zinc-500">
            En attente : {stats.pendingPayments} · Échoués :{" "}
            {stats.failedPayments}
          </p>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
