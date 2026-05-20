"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle, ArrowLeft, Loader2 } from "lucide-react";

function VoteSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const paymentId = searchParams.get("paymentId");
  const [paymentDetails, setPaymentDetails] = useState<{
    choiceLabel: string | null;
    nbVotes: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!paymentId) {
      const t = window.setTimeout(() => router.push("/"), 3000);
      setLoading(false);
      return () => window.clearTimeout(t);
    }

    fetch(`/api/payment/status?paymentId=${encodeURIComponent(paymentId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.status === "completed") {
          setPaymentDetails({
            choiceLabel:
              typeof data.choiceLabel === "string" ? data.choiceLabel : null,
            nbVotes: typeof data.nbVotes === "number" && data.nbVotes > 0 ? data.nbVotes : 1,
          });
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [paymentId, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-50 dark:bg-[var(--dark-page-bg)]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-nci-navy dark:text-white animate-spin mx-auto mb-4" />
          <p className="text-zinc-700 dark:text-white text-lg">Vérification du paiement…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-50 dark:bg-[var(--dark-page-bg)]">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="rounded-3xl p-8 max-w-md w-full shadow-2xl border border-zinc-200/90 bg-white/95 dark:border-white/10 dark:bg-[var(--dark-surface-bg)]"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="flex justify-center mb-6"
        >
          <div className="bg-nci-green rounded-full p-4">
            <CheckCircle className="w-16 h-16 text-white" />
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-3xl font-bold text-zinc-900 dark:text-white text-center mb-4"
        >
          Paiement réussi !
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-center mb-8"
        >
          {paymentDetails?.choiceLabel ? (
            paymentDetails.nbVotes === 1 ? (
              <>
                <p className="text-zinc-600 dark:text-white/90 text-lg mb-2">
                  Votre réponse pour
                </p>
                <p className="text-3xl font-bold text-nci-navy dark:text-nci-orange mb-2">
                  {paymentDetails.choiceLabel}
                </p>
                <p className="text-zinc-500 dark:text-white/70 text-sm">
                  a été enregistrée avec succès !
                </p>
              </>
            ) : (
              <>
                <p className="text-zinc-600 dark:text-white/90 text-lg mb-2">
                  Vos{" "}
                  <span className="font-bold text-nci-orange">{paymentDetails.nbVotes} réponses</span>{" "}
                  pour
                </p>
                <p className="text-3xl font-bold text-nci-navy dark:text-nci-orange mb-2">
                  {paymentDetails.choiceLabel}
                </p>
                <p className="text-zinc-500 dark:text-white/70 text-sm">
                  ont été enregistrées avec succès !
                </p>
              </>
            )
          ) : (
            <p className="text-zinc-600 dark:text-white/90 text-lg">
              Votre paiement a été validé.
              <br />
              Vos réponses ont été comptabilisées !
            </p>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <button
            type="button"
            onClick={() => router.push("/")}
            className="w-full bg-nci-navy hover:bg-nci-navy-hover text-white font-semibold py-4 px-6 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg"
          >
            <ArrowLeft className="w-5 h-5" />
            Retour au jeu
          </button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-zinc-500 dark:text-white/60 text-sm text-center mt-6"
        >
          Merci pour votre participation !
        </motion.p>
      </motion.div>
    </div>
  );
}

export default function VoteSuccessPage() {
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
      <VoteSuccessContent />
    </Suspense>
  );
}
