"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";

type PaymentRow = {
  id: string;
  correlation_id: string;
  choice_id: string;
  choice_label: string;
  campaign_question: string | null;
  nb_votes: number;
  wallet_id: string;
  msisdn: string | null;
  status: string;
  amount_fcfa: number;
  failure_code: string | null;
  failure_detail: string | null;
  created_at: string;
};

const WALLET_LABELS: Record<string, string> = {
  orange_ci: "Orange",
  mtn_ci: "MTN",
  moov_ci: "Moov",
  wave_ci: "Wave",
};

function statusClass(status: string) {
  const s = status.toLowerCase();
  if (s === "completed") return "text-emerald-400 bg-emerald-500/10";
  if (s === "failed") return "text-red-400 bg-red-500/10";
  return "text-amber-300 bg-amber-500/10";
}

export function AdminPaymentsContent() {
  const searchParams = useSearchParams();
  const campaignId = searchParams.get("campaignId");

  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = campaignId
        ? `/api/admin/payment-intents?campaignId=${encodeURIComponent(campaignId)}`
        : "/api/admin/payment-intents";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { rows: PaymentRow[] };
      setRows(data.rows ?? []);
    } catch {
      setError("Impossible de charger les paiements.");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filterLabel = campaignId
    ? rows[0]?.campaign_question ?? "Campagne archivée"
    : "Toutes campagnes (récents)";

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Paiements</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {filterLabel} — {rows.length} ligne{rows.length !== 1 ? "s" : ""} (300 max)
          </p>
          {campaignId && (
            <a
              href="/admin/payments"
              className="mt-1 inline-block text-xs text-[var(--nci-orange)] hover:underline"
            >
              Voir tous les paiements
            </a>
          )}
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

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              {!campaignId && <th className="px-4 py-3">Campagne</th>}
              <th className="px-4 py-3">Choix</th>
              <th className="px-4 py-3">Votes</th>
              <th className="px-4 py-3">Wallet</th>
              <th className="px-4 py-3">Montant</th>
              <th className="px-4 py-3">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading && rows.length === 0 ? (
              <tr>
                <td
                  colSpan={campaignId ? 6 : 7}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  Chargement…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={campaignId ? 6 : 7}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  Aucun paiement.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-400">
                    {new Date(r.created_at).toLocaleString("fr-FR")}
                  </td>
                  {!campaignId && (
                    <td
                      className="max-w-[200px] truncate px-4 py-3 text-zinc-500"
                      title={r.campaign_question ?? ""}
                    >
                      {r.campaign_question ?? "—"}
                    </td>
                  )}
                  <td className="px-4 py-3 text-white">{r.choice_label}</td>
                  <td className="px-4 py-3 text-zinc-300">{r.nb_votes}</td>
                  <td className="px-4 py-3 text-zinc-300">
                    {WALLET_LABELS[r.wallet_id] ?? r.wallet_id}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {r.amount_fcfa?.toLocaleString("fr-FR")} F
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-lg px-2 py-0.5 text-xs font-medium ${statusClass(r.status)}`}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
