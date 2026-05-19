"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { responseSlotLabel } from "@/lib/pollChoices";

type PollChoice = {
  id: string;
  label: string;
  votes: number;
};

type CampaignPayload = {
  campaignId?: string;
  questionText: string;
  votesClosed: boolean;
  votesClosedEnv: boolean;
  startedAt?: string | null;
  updatedAt: string | null;
  choices: PollChoice[];
};

export default function AdminSondagePage() {
  const [data, setData] = useState<CampaignPayload | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [votesClosed, setVotesClosed] = useState(false);
  const [choiceLabels, setChoiceLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newQuestionText, setNewQuestionText] = useState("");
  const [rotating, setRotating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/campaign", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const json = (await res.json()) as CampaignPayload;
      setData(json);
      setQuestionText(json.questionText);
      setVotesClosed(json.votesClosed);
      setChoiceLabels(
        Object.fromEntries((json.choices ?? []).map((c) => [c.id, c.label]))
      );
    } catch {
      setError("Impossible de charger le sondage.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startNewCampaign = async () => {
    if (
      !window.confirm(
        "Archiver la campagne en cours et démarrer une nouvelle question ? Les totaux actuels seront conservés dans l’historique."
      )
    ) {
      return;
    }
    setRotating(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionText: newQuestionText.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      setMessage("Nouvelle campagne démarrée. Complétez les libellés puis enregistrez.");
      setNewQuestionText("");
      await load();
    } catch {
      setError("Impossible de démarrer une nouvelle campagne.");
    } finally {
      setRotating(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const choices = (data?.choices ?? []).map((c) => ({
        id: c.id,
        label: choiceLabels[c.id] ?? c.label,
      }));

      const res = await fetch("/api/admin/campaign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionText, votesClosed, choices }),
      });
      if (!res.ok) throw new Error();
      setMessage("Enregistré — le site public sera mis à jour au prochain chargement.");
      await load();
    } catch {
      setError("Échec de l’enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Sondage</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Pilotage de la campagne affichée sur le jeu public : la{" "}
            <strong className="font-medium text-zinc-200">question</strong>, le texte
            de chaque{" "}
            <strong className="font-medium text-zinc-200">
              réponse (A, B…)
            </strong>{" "}
            et l’ouverture ou la fermeture des votes. Pour une nouvelle question de
            semaine, utilisez « Nouvelle campagne » : l’actuelle sera archivée dans
            l’historique avec ses totaux.
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

      {data?.votesClosedEnv && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <code className="text-amber-200">VOTES_CLOSED</code> est actif dans
          l’environnement : les votes restent fermés même si vous rouvrez ici.
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {message}
        </p>
      )}

      <div className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="space-y-2">
          <label htmlFor="question" className="text-xs font-medium uppercase text-zinc-500">
            Question (page d’accueil)
          </label>
          <textarea
            id="question"
            rows={3}
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            disabled={loading}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-[var(--nci-navy)]/60"
          />
        </div>

        {(data?.choices ?? []).length > 0 && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase text-zinc-500">
                Choix du sondage
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                Chaque ligne est un emplacement de réponse (A, B…). Modifiez uniquement
                le texte affiché sur le jeu public.
              </p>
            </div>
            {data!.choices.map((c, index) => (
              <div
                key={c.id}
                className="rounded-xl border border-white/10 bg-black/20 p-4"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor={`choice-label-${c.id}`}
                    className="text-sm font-medium text-zinc-200"
                  >
                    {responseSlotLabel(index)}
                  </label>
                  <span className="text-xs tabular-nums text-zinc-500">
                    {c.votes} vote{c.votes !== 1 ? "s" : ""}
                  </span>
                </div>
                <input
                  id={`choice-label-${c.id}`}
                  type="text"
                  value={choiceLabels[c.id] ?? ""}
                  onChange={(e) =>
                    setChoiceLabels((prev) => ({
                      ...prev,
                      [c.id]: e.target.value,
                    }))
                  }
                  disabled={loading}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white outline-none focus:border-[var(--nci-navy)]/60"
                />
                <p className="mt-2 text-[11px] text-zinc-600">
                  Texte affiché sur le site pour {responseSlotLabel(index).toLowerCase()}
                </p>
              </div>
            ))}
          </div>
        )}

        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={votesClosed}
            onChange={(e) => setVotesClosed(e.target.checked)}
            disabled={loading || data?.votesClosedEnv}
            className="h-4 w-4 rounded border-white/20"
          />
          <span className="text-sm text-zinc-200">
            Fermer les votes sur le site (base de données)
          </span>
        </label>

        {data?.updatedAt && (
          <p className="text-xs text-zinc-500">
            Dernière mise à jour campagne :{" "}
            {new Date(data.updatedAt).toLocaleString("fr-FR")}
          </p>
        )}

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || loading}
          className="cursor-pointer rounded-xl bg-[var(--nci-navy)] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[var(--nci-navy-hover)] disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>

      <section className="space-y-4 rounded-2xl border border-[var(--nci-orange)]/30 bg-[var(--nci-orange)]/5 p-6">
        <h2 className="text-lg font-semibold text-white">Nouvelle campagne</h2>
        <p className="text-sm text-zinc-400">
          Clôture la campagne en cours (conservée dans{" "}
          <a href="/admin/historique" className="text-[var(--nci-orange)] hover:underline">
            Historique
          </a>
          ) et remet les compteurs à zéro pour une nouvelle question.
        </p>
        <textarea
          rows={2}
          value={newQuestionText}
          onChange={(e) => setNewQuestionText(e.target.value)}
          placeholder="Nouvelle question (optionnel — à compléter ensuite)"
          disabled={rotating}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-[var(--nci-navy)]/60"
        />
        <button
          type="button"
          onClick={() => void startNewCampaign()}
          disabled={rotating || loading}
          className="cursor-pointer rounded-xl border border-[var(--nci-orange)]/50 bg-[var(--nci-orange)]/20 px-6 py-2.5 text-sm font-semibold text-white hover:bg-[var(--nci-orange)]/30 disabled:opacity-50"
        >
          {rotating ? "Création…" : "Archiver et nouvelle campagne"}
        </button>
      </section>
    </div>
  );
}
