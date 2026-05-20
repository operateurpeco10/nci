"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { XCircle, ArrowLeft, Loader2 } from "lucide-react";

type StatusPayload = {
  success?: boolean;
  status?: string;
  walletId?: string;
  choiceId?: string;
  choiceLabel?: string | null;
  nbVotes?: number;
  error?: string;
};

function VoteFailureContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const paymentId = searchParams.get("paymentId");
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "no_id" }
    | { kind: "fetch_error"; message: string }
    | {
        kind: "ready";
        status: string;
        walletId?: string;
        choiceLabel: string | null;
        nbVotes: number;
        callbackUnverified: boolean;
        wavePopupClosed: boolean;
      }
  >({ kind: "loading" });

  const callbackUnverified =
    searchParams.get("reason") === "signature_mismatch";
  const wavePopupClosed = searchParams.get("reason") === "popup_closed";

  useEffect(() => {
    if (!paymentId) {
      setState({ kind: "no_id" });
      return;
    }

    let cancelled = false;
    fetch(`/api/payment/status?paymentId=${encodeURIComponent(paymentId)}`)
      .then((res) => res.json())
      .then((data: StatusPayload) => {
        if (cancelled) return;
        if (!data.success) {
          setState({
            kind: "fetch_error",
            message:
              typeof data.error === "string"
                ? data.error
                : "Impossible de charger le statut.",
          });
          return;
        }
        const st = (data.status ?? "").trim().toLowerCase();
        if (st === "completed") {
          router.replace(`/vote/success?paymentId=${encodeURIComponent(paymentId)}`);
          return;
        }
        setState({
          kind: "ready",
          status: st,
          walletId: typeof data.walletId === "string" ? data.walletId : undefined,
          choiceLabel:
            typeof data.choiceLabel === "string" ? data.choiceLabel : null,
          nbVotes:
            typeof data.nbVotes === "number" && data.nbVotes > 0 ? data.nbVotes : 1,
          callbackUnverified,
          wavePopupClosed,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            kind: "fetch_error",
            message: "Erreur réseau. Réessayez dans un instant.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [paymentId, router, callbackUnverified, wavePopupClosed]);

  const cardClass =
    "rounded-3xl p-8 max-w-md w-full shadow-2xl border border-zinc-200/90 bg-white/95 dark:border-white/10 dark:bg-[var(--dark-surface-bg)]";
  const pageClass =
    "min-h-screen flex items-center justify-center p-4 bg-zinc-50 dark:bg-[var(--dark-page-bg)]";
  const btnClass =
    "w-full bg-nci-navy hover:bg-nci-navy-hover text-white font-semibold py-4 px-6 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg";

  if (state.kind === "loading") {
    return (
      <div className={pageClass}>
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-nci-navy dark:text-white animate-spin mx-auto mb-4" />
          <p className="text-zinc-700 dark:text-white text-lg">Vérification du paiement…</p>
        </div>
      </div>
    );
  }

  if (state.kind === "no_id") {
    return (
      <div className={pageClass}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cardClass}
        >
          <div className="flex justify-center mb-6">
            <div className="bg-amber-500/90 rounded-full p-4">
              <XCircle className="w-16 h-16 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white text-center mb-4">
            Paiement non confirmé
          </h1>
          <p className="text-zinc-600 dark:text-white/80 text-center mb-8 text-sm">
            Aucune référence de transaction n&apos;a été fournie. Retournez sur le jeu pour réessayer.
          </p>
          <button type="button" onClick={() => router.push("/")} className={btnClass}>
            <ArrowLeft className="w-5 h-5" />
            Retour au jeu
          </button>
        </motion.div>
      </div>
    );
  }

  if (state.kind === "fetch_error") {
    return (
      <div className={pageClass}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cardClass}
        >
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white text-center mb-3">
            Impossible de vérifier
          </h1>
          <p className="text-zinc-600 dark:text-white/75 text-center text-sm mb-8">
            {state.message}
          </p>
          <button type="button" onClick={() => router.push("/")} className={btnClass}>
            <ArrowLeft className="w-5 h-5" />
            Retour au jeu
          </button>
        </motion.div>
      </div>
    );
  }

  const isStillPending =
    state.status === "pending" || state.status === "processing";

  return (
    <div className={pageClass}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className={cardClass}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 200 }}
          className="flex justify-center mb-6"
        >
          <div className="bg-rose-600 rounded-full p-4">
            <XCircle className="w-16 h-16 text-white" />
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-3xl font-bold text-zinc-900 dark:text-white text-center mb-3"
        >
          {isStillPending ? "Paiement en cours" : "Paiement non abouti"}
        </motion.h1>

        {state.callbackUnverified && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.22 }}
            className="text-center text-xs text-amber-800 dark:text-amber-200/90 mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5"
          >
            Le retour depuis le paiement n&apos;a pas pu être vérifié automatiquement (signature).
            Si le paiement a été refusé ou annulé, aucune réponse n&apos;est comptée — vous pouvez
            réessayer.
          </motion.p>
        )}

        {state.wavePopupClosed && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.22 }}
            className="text-center text-xs text-amber-800 dark:text-amber-200/90 mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5"
          >
            La fenêtre Wave a été fermée avant la fin du paiement. Si le débit n&apos;est pas passé,
            aucune réponse n&apos;est comptée — vous pouvez réessayer.
          </motion.p>
        )}

        {state.choiceLabel ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-center mb-6"
          >
            <p className="text-zinc-600 dark:text-white/85 text-sm mb-1">
              {state.nbVotes === 1
                ? "Tentative de réponse pour"
                : `Tentative (${state.nbVotes} réponses) pour`}
            </p>
            <p className="text-2xl font-bold text-nci-navy dark:text-nci-orange mb-4">
              {state.choiceLabel}
            </p>
          </motion.div>
        ) : null}

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <button type="button" onClick={() => router.push("/")} className={btnClass}>
            <ArrowLeft className="w-5 h-5" />
            Retour au jeu
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default function VoteFailurePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-50 dark:bg-[var(--dark-page-bg)]">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-nci-navy dark:text-white animate-spin mx-auto mb-4" />
            <p className="text-zinc-700 dark:text-white text-lg">Chargement…</p>
          </div>
        </div>
      }
    >
      <VoteFailureContent />
    </Suspense>
  );
}
