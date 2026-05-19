"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { responseSlotLabel, slotIndexFromChoiceId } from "@/lib/pollChoices";

type HistoryChoice = {
  id: string;
  label: string;
  votes: number;
  slot: string;
};

type HistoryCampaign = {
  id: string;
  questionText: string;
  status: string;
  votesClosed: boolean;
  startedAt: string;
  endedAt: string | null;
  choices: HistoryChoice[];
  totalVotes: number;
  completedPayments: number;
  totalRevenueFcfa: number;
};

function formatFcfa(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " F";
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function CampaignGrid({ items }: { items: HistoryCampaign[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">Aucune campagne dans cette section.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((c) => (
        <CampaignCard key={c.id} c={c} />
      ))}
    </div>
  );
}

function CampaignCard({ c }: { c: HistoryCampaign }) {
  const isActive = c.status === "active";

  return (
    <article className="flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.04] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.06]">
      <div className="flex items-start justify-between gap-2">
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            isActive
              ? "bg-emerald-500/20 text-emerald-300"
              : "bg-zinc-500/20 text-zinc-400"
          }`}
        >
          {isActive ? "En cours" : "Archivée"}
        </span>
        <span className="text-[10px] tabular-nums text-zinc-500">
          {formatDateShort(c.startedAt)}
          {c.endedAt ? ` → ${formatDateShort(c.endedAt)}` : ""}
        </span>
      </div>

      <h2 className="mt-3 line-clamp-3 min-h-[3.75rem] text-sm font-semibold leading-snug text-white">
        {c.questionText}
      </h2>

      <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-black/25 px-2 py-2 text-center">
        <div>
          <p className="text-[10px] uppercase text-zinc-500">Votes</p>
          <p className="text-sm font-semibold tabular-nums text-zinc-200">
            {c.totalVotes}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-zinc-500">Paie.</p>
          <p className="text-sm font-semibold tabular-nums text-zinc-200">
            {c.completedPayments}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-zinc-500">CA</p>
          <p className="text-xs font-semibold tabular-nums leading-tight text-zinc-200">
            {formatFcfa(c.totalRevenueFcfa)}
          </p>
        </div>
      </div>

      <ul className="mt-3 flex-1 space-y-1.5 border-t border-white/10 pt-3">
        {c.choices.map((ch, index) => (
          <li
            key={`${c.id}-${ch.id}`}
            className="flex items-start justify-between gap-2 text-xs"
          >
            <span className="line-clamp-2 min-w-0 text-zinc-400">
              <span className="font-medium text-zinc-300">
                {responseSlotLabel(slotIndexFromChoiceId(ch.id, index))}
              </span>{" "}
              {ch.label}
            </span>
            <span className="shrink-0 tabular-nums text-zinc-500">{ch.votes}</span>
          </li>
        ))}
      </ul>

      {c.status === "archived" ? (
        <Link
          href={`/admin/payments?campaignId=${c.id}`}
          className="mt-3 block truncate text-center text-[11px] font-medium text-[var(--nci-orange)] hover:underline"
        >
          Paiements →
        </Link>
      ) : (
        <div className="mt-3 h-[15px]" aria-hidden />
      )}
    </article>
  );
}

export default function AdminHistoriquePage() {
  const [campaigns, setCampaigns] = useState<HistoryCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/campaigns/history", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { campaigns: HistoryCampaign[] };
      setCampaigns(data.campaigns ?? []);
    } catch {
      setError("Impossible de charger l’historique.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCampaigns = useMemo(
    () => campaigns.filter((c) => c.status === "active"),
    [campaigns]
  );
  const archivedCampaigns = useMemo(
    () => campaigns.filter((c) => c.status !== "active"),
    [campaigns]
  );

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Historique</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Campagnes passées et campagne en cours — vue compacte.
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

      {loading && campaigns.length === 0 ? (
        <p className="text-sm text-zinc-500">Chargement…</p>
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-zinc-500">Aucune campagne enregistrée.</p>
      ) : (
        <div className="space-y-10">
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-emerald-400">
              En cours
            </h2>
            <CampaignGrid items={activeCampaigns} />
          </section>

          {archivedCampaigns.length > 0 && (
            <section>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                Archivées
              </h2>
              <CampaignGrid items={archivedCampaigns} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
