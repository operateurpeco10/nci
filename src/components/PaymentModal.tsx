"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { X, ShieldCheck, ChevronLeft } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import VotePackSelector from "./VotePackSelector";
import { VoteSuccessOverlay } from "./VoteSuccessOverlay";
import { WalletOperatorHints } from "./WalletOperatorHints";
import { VOTE_PACKS } from "@/lib/votePacks";
import { getWalletDvPassFlow, PAYMENT_WALLETS } from "@/lib/paymentWallets";
import { RESPONSE_COPY, responseUnit } from "@/lib/responseCopy";
import type { VotePack } from "@/types/digima";

type PollPaymentResult =
  | { ok: true }
  | { ok: false; error: string }
  | { ok: false; reason: "wave_popup_closed" };

type InitiateJson = {
  success?: boolean;
  error?: string;
  paymentId?: string;
  status?: string;
  redirectUrl?: string;
  failureMessage?: string;
};

export interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  coupleName?: string;
  /** Identifiant emplacement choix (`a`, `b`) pour la campagne active */
  choiceId?: string;
  coupleImage?: string;
  onPaymentComplete?: (detail: { nbVotes: number }) => void;
}

const PAYMENT_LOCALE = "fr";

function WalletMethodLogo({ src, label }: { src: string; label: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-bold text-zinc-600 dark:bg-white/10 dark:text-gray-300">
        {label.slice(0, 1)}
      </div>
    );
  }
  return (
    // Logos fournis par l’utilisateur dans `public/images/logo/`
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-zinc-200/80 dark:ring-white/10"
      onError={() => setBroken(true)}
    />
  );
}

export default function PaymentModal({
  isOpen,
  onClose,
  coupleName,
  choiceId,
  coupleImage,
  onPaymentComplete,
}: PaymentModalProps) {
  const [selectedPack, setSelectedPack] = useState<VotePack>(VOTE_PACKS[0]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paymentActive, setPaymentActive] = useState(false);
  const [dvPassActive, setDvPassActive] = useState(false);
  const [paymentBypassWave, setPaymentBypassWave] = useState(false);
  const [votesClosed, setVotesClosed] = useState(false);
  const [paymentStep, setPaymentStep] = useState<1 | 2>(1);
  const [successPayload, setSuccessPayload] = useState<{
    votes: number;
    name: string;
  } | null>(null);
  const formSectionRef = useRef<HTMLDivElement>(null);
  const wavePopupClosedRef = useRef(false);
  const [pollingState, setPollingState] = useState<{
    paymentId: string;
    attempt: number;
    maxAttempts: number;
    message: string;
  } | null>(null);

  const totalAmount = selectedPack.price_fcfa;
  const voteCount = selectedPack.votes;

  const isOrangeWallet = selectedWallet === "orange_ci";
  const isWaveWallet = selectedWallet === "wave_ci";
  const waveBypassActive = paymentBypassWave && isWaveWallet;
  const dvPassFlow = selectedWallet ? getWalletDvPassFlow(selectedWallet) : null;
  const needsOtp =
    dvPassActive && dvPassFlow === "validate"
      ? true
      : !dvPassActive && isOrangeWallet;
  const otpMaxLength = isOrangeWallet && !dvPassActive ? 4 : dvPassActive ? 12 : 8;

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setSelectedPack(VOTE_PACKS[0]);
    setPaymentStep(1);
    setPhoneNumber("");
    setOtpCode("");
    setSelectedWallet(null);
    setSuccessPayload(null);
    setVotesClosed(false);
    fetch("/api/payment/options", { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (d: {
          paymentActive?: boolean;
          votesClosed?: boolean;
          dvPassActive?: boolean;
          paymentBypassWave?: boolean;
        }) => {
          if (!cancelled) {
            setPaymentActive(d.paymentActive === true);
            setDvPassActive(d.dvPassActive === true);
            setPaymentBypassWave(d.paymentBypassWave === true);
            setVotesClosed(d.votesClosed === true);
          }
        }
      )
      .catch(() => {
        if (!cancelled) {
          setPaymentActive(false);
          setDvPassActive(false);
          setPaymentBypassWave(false);
          setVotesClosed(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setPaymentStep(1);
      setSuccessPayload(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!successPayload || !onPaymentComplete) return;
    const timer = window.setTimeout(() => {
      onPaymentComplete({ nbVotes: successPayload.votes });
      setSuccessPayload(null);
      onClose();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [successPayload, onPaymentComplete, onClose]);

  if (!isOpen) return null;

  const displayName = coupleName || "ce joueur";
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms);
    });

  const normalizePaymentStatus = (status: string | undefined) =>
    (status ?? "").trim().toLowerCase();

  const pollPaymentStatus = async (
    paymentId: string,
    maxAttempts: number,
    intervalMs: number,
    isWaveFlow: boolean,
    waveClosedRef: { current: boolean } | null
  ): Promise<PollPaymentResult> => {
    const staleClientMs = isWaveFlow ? 140_000 : 88_000;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (isWaveFlow && waveClosedRef?.current) {
        return { ok: false, reason: "wave_popup_closed" };
      }
      setPollingState({
        paymentId,
        attempt,
        maxAttempts,
        message: "Vérification du paiement en cours…",
      });

      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 12000);
        const res = await fetch(
          `/api/payment/status?paymentId=${encodeURIComponent(paymentId)}`,
          { cache: "no-store", signal: controller.signal }
        ).finally(() => window.clearTimeout(timeout));
        const payload = (await res.json()) as {
          success?: boolean;
          status?: string;
          error?: string;
          createdAt?: string;
          failureMessage?: string;
        };

        if (payload.success) {
          const st = normalizePaymentStatus(payload.status);
          if (st === "completed") return { ok: true };
          if (st === "failed") {
            const fromApi =
              typeof payload.failureMessage === "string" ? payload.failureMessage.trim() : "";
            return {
              ok: false,
              error:
                fromApi ||
                "Paiement non abouti. Vérifiez votre compte mobile money puis réessayez.",
            };
          }
          if ((st === "pending" || st === "processing") && payload.createdAt?.trim()) {
            const createdMs = new Date(payload.createdAt).getTime();
            if (Number.isFinite(createdMs) && Date.now() - createdMs > staleClientMs) {
              return {
                ok: false,
                error: "Délai dépassé sans confirmation du paiement.",
              };
            }
          }
        } else if (payload.error) {
          return { ok: false, error: payload.error };
        }
      } catch {
        /* transient */
      }

      if (attempt < maxAttempts) await sleep(intervalMs);
    }

    return {
      ok: false,
      error: "Délai dépassé sans confirmation du paiement.",
    };
  };

  const openWaveRedirectPopup = (redirectUrl: string) =>
    window.open(
      redirectUrl,
      "WavePayment",
      "width=520,height=760,scrollbars=yes,resizable=yes,status=yes"
    );

  const handleConfirm = async () => {
    setError(null);

    if (votesClosed) {
      setError(RESPONSE_COPY.paymentPeriodEnded);
      return;
    }

    if (!paymentActive) {
      setError("Le paiement en ligne n'est pas encore configuré.");
      return;
    }

    if (!choiceId?.trim()) {
      setError("Choisissez d'abord une réponse.");
      return;
    }

    if (!selectedWallet) {
      setError("Choisissez un moyen de paiement (Mobile Money).");
      return;
    }

    const phone = phoneNumber.replace(/\D/g, "");
    if (phone.length < 8) {
      setError("Renseignez un numéro de téléphone mobile valide.");
      return;
    }

    if (needsOtp && isOrangeWallet && !dvPassActive && otpCode.length !== 4) {
      setError("Saisissez le code OTP Orange à 4 chiffres.");
      return;
    }

    if (needsOtp && dvPassActive && otpCode.trim().length < 4) {
      setError("Saisissez le code PIN / OTP demandé par l'opérateur.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/payment/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          choiceId: choiceId.trim(),
          nbVotes: voteCount,
          packId: selectedPack.id,
          telephoneVotant: phoneNumber.trim(),
          otpCode: needsOtp ? otpCode.trim() || undefined : undefined,
          paiementVia: selectedWallet,
          locale: PAYMENT_LOCALE,
        }),
      });

      const data = (await response.json()) as InitiateJson;

      if (data.success) {
        const paymentId =
          typeof data.paymentId === "string" ? data.paymentId : null;
        const status =
          typeof data.status === "string" ? data.status.trim().toLowerCase() : "completed";

        if (status === "failed") {
          setError(
            (typeof data.failureMessage === "string" && data.failureMessage.trim()) ||
              "Paiement refusé. Veuillez réessayer."
          );
          return;
        }

        if ((status === "pending" || status === "processing") && paymentId) {
          let wavePopup: Window | null = null;
          if (isWaveWallet) {
            const redirectUrl =
              typeof data.redirectUrl === "string" && data.redirectUrl.trim().length > 0
                ? data.redirectUrl.trim()
                : null;
            if (!redirectUrl) {
              setError("URL de paiement Wave manquante.");
              return;
            }
            wavePopup = openWaveRedirectPopup(redirectUrl);
            if (!wavePopup) {
              setError("Autorisez les popups pour finaliser le paiement Wave.");
              return;
            }
          }

          let waveCloseWatch: ReturnType<typeof setInterval> | undefined;
          if (isWaveWallet && wavePopup) {
            wavePopupClosedRef.current = false;
            waveCloseWatch = setInterval(() => {
              try {
                if (wavePopup?.closed) wavePopupClosedRef.current = true;
              } catch {
                wavePopupClosedRef.current = true;
              }
            }, 600);
          }

          let pollResult: PollPaymentResult;
          try {
            pollResult = await pollPaymentStatus(
              paymentId,
              isWaveWallet ? 45 : 24,
              isWaveWallet ? 3000 : 4000,
              isWaveWallet,
              isWaveWallet ? wavePopupClosedRef : null
            );
          } finally {
            if (waveCloseWatch) clearInterval(waveCloseWatch);
          }
          setPollingState(null);

          if (wavePopup && !wavePopup.closed) {
            try {
              wavePopup.close();
            } catch {
              /* ignore */
            }
          }

          if (!pollResult.ok) {
            if ("reason" in pollResult && pollResult.reason === "wave_popup_closed") {
              setError("Paiement Wave interrompu. Vérifiez si le débit est passé avant de réessayer.");
            } else {
              setError("error" in pollResult ? pollResult.error : "Paiement non confirmé.");
            }
            return;
          }
        }

        setSuccessPayload({ votes: voteCount, name: displayName });
      } else {
        setError(data.error || "Erreur lors du paiement");
      }
    } catch {
      setError("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const goBackToStep1 = () => {
    setPaymentStep(1);
    setError(null);
    setSelectedWallet(null);
    setOtpCode("");
  };

  const inputBase =
    "w-full rounded-xl border bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-[var(--nci-navy)] dark:border-white/15 dark:bg-black/35 dark:text-white dark:placeholder:text-white/35";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 py-6" role="presentation">
      <div className="payment-modal-surface relative max-h-[92vh] w-full max-w-lg overflow-y-auto overflow-x-hidden rounded-2xl border border-zinc-200/90 bg-zinc-50 shadow-xl dark:border-white/5 dark:bg-[var(--dark-surface-bg)] lg:max-w-xl">
        <AnimatePresence>
          {pollingState && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[85] flex items-center justify-center bg-black/55 px-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-sm rounded-2xl border border-zinc-200/90 bg-white p-5 text-center shadow-xl dark:border-white/15 dark:bg-[var(--dark-surface-bg)]"
              >
                <motion.div
                  className="mx-auto mb-3 h-7 w-7 rounded-full border-2 border-zinc-200 border-t-[var(--nci-navy)] dark:border-white/20 dark:border-t-[#5b9de0]"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Paiement en cours de validation
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-gray-400">
                  {pollingState.message}
                </p>
                <p className="mt-2 text-[11px] text-zinc-400">
                  {pollingState.attempt}/{pollingState.maxAttempts}
                </p>
              </motion.div>
            </motion.div>
          )}
          {successPayload && (
            <VoteSuccessOverlay votes={successPayload.votes} name={successPayload.name} />
          )}
        </AnimatePresence>
        <div className="space-y-5 p-6">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200/90 pb-4 dark:border-white/5">
            <div className="relative h-11 w-[min(220px,55vw)] shrink-0">
              <Image
                src="/images/logo_nci.png"
                alt="NCI"
                fill
                className="object-contain object-left"
                sizes="220px"
              />
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <span className="hidden text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-white/20 sm:inline">
                Paiement sécurisé
              </span>
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22C55E]" />
              <button
                type="button"
                onClick={onClose}
                disabled={Boolean(successPayload)}
                className="cursor-pointer rounded-xl border border-zinc-200/90 bg-white/90 p-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {coupleImage ? (
              <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 dark:border-white/12 dark:bg-white/[0.06]">
                <Image src={coupleImage} alt={displayName} fill className="object-cover" sizes="44px" />
              </div>
            ) : null}
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500 dark:text-white/35">
                {paymentStep === 1 ? RESPONSE_COPY.stepPack : RESPONSE_COPY.stepPayment}
              </p>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-white">
                {RESPONSE_COPY.modalHeadingPrefix}{" "}
                <span className="text-[var(--nci-navy)] dark:text-[#5b9de0]">{displayName}</span>
              </h2>
            </div>
          </div>

          {votesClosed && (
            <div
              role="status"
              className="rounded-xl border border-red-200 bg-red-600 px-3 py-3 text-center text-sm font-semibold leading-snug text-white dark:border-red-800/40 dark:bg-[#d42838] sm:text-[15px]"
            >
              {RESPONSE_COPY.periodClosed}
            </div>
          )}

          {!paymentActive && !votesClosed && (
            <p className="rounded-xl border border-amber-200/90 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              Le paiement en ligne est momentanément indisponible.
            </p>
          )}

          <div
            className={`flex gap-1.5 ${votesClosed ? "opacity-40" : ""}`}
            aria-label={`Étape ${paymentStep} sur 2`}
          >
            <div
              className={`h-1 flex-1 rounded-full transition-colors ${
                paymentStep === 1 ? "bg-nci-orange" : "bg-nci-orange/45 dark:bg-nci-orange/35"
              }`}
            />
            <div
              className={`h-1 flex-1 rounded-full transition-colors ${
                paymentStep === 2 ? "bg-nci-orange" : "bg-zinc-200 dark:bg-white/12"
              }`}
            />
          </div>

          {paymentStep === 1 && (
            <>
              <div className={`space-y-3 ${votesClosed ? "pointer-events-none opacity-45" : ""}`}>
                <VotePackSelector
                  variant="minimal"
                  selectedPackId={selectedPack.id}
                  onPackSelect={(pack) => {
                    setSelectedPack(pack);
                    setError(null);
                  }}
                />
              </div>

              <button
                type="button"
                disabled={votesClosed}
                onClick={() => {
                  setError(null);
                  setPaymentStep(2);
                }}
                className="pay-modal-primary w-full cursor-pointer rounded-xl bg-[var(--nci-navy)] px-4 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-[0.96] disabled:cursor-not-allowed disabled:opacity-40 dark:disabled:opacity-[0.15]"
              >
                {RESPONSE_COPY.continuePayment}
              </button>
            </>
          )}

          {paymentStep === 2 && (
            <>
              {waveBypassActive && (
                <p
                  role="status"
                  className="rounded-xl border border-amber-200/90 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
                >
                  Mode test Wave : aucun débit réel (PAYMENT_BYPASS_WAVE). Les réponses seront
                  créditées dans Supabase.
                </p>
              )}
              <div
                className={`flex flex-wrap items-center gap-2 ${votesClosed ? "pointer-events-none opacity-45" : ""}`}
              >
                <button
                  type="button"
                  onClick={goBackToStep1}
                  className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left text-xs font-medium leading-snug text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-white/12 dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/10 sm:w-auto sm:justify-start"
                >
                  <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{RESPONSE_COPY.backToPacks}</span>
                </button>
                <span className="text-xs text-zinc-500 dark:text-gray-400">
                  {voteCount.toLocaleString("fr-FR")} {responseUnit(voteCount)} ·{" "}
                  <span className="font-semibold text-price-blue">
                    {totalAmount.toLocaleString("fr-FR")} FCFA
                  </span>
                </span>
                <span className="ml-auto hidden items-center gap-1 text-[11px] font-medium text-[var(--nci-navy)]/90 dark:text-[#6b9fd6]/95 sm:inline-flex">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  Paiement sécurisé
                </span>
              </div>

              <div className={`space-y-2 ${votesClosed ? "pointer-events-none opacity-45" : ""}`}>
                <p className="text-xs text-zinc-500 dark:text-gray-400">Moyen de paiement :</p>
                <div className="grid grid-cols-2 gap-3">
                  {PAYMENT_WALLETS.map((wallet) => (
                    <button
                      key={wallet.id}
                      type="button"
                      className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2.5 text-left text-xs transition-colors ${
                        selectedWallet === wallet.id
                          ? "border-nci-orange bg-nci-orange/15 shadow-sm shadow-nci-orange/15 dark:border-nci-orange/85 dark:bg-nci-orange/22"
                          : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/10"
                      }`}
                      onClick={() => {
                        setSelectedWallet(wallet.id);
                        setError(null);
                        setOtpCode("");
                        window.setTimeout(() => {
                          formSectionRef.current?.scrollIntoView({
                            behavior: "smooth",
                            block: "nearest",
                          });
                        }, 80);
                      }}
                    >
                      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white dark:bg-white/90">
                        <WalletMethodLogo src={wallet.icon} label={wallet.name} />
                      </div>
                      <span className="font-medium text-[11px] leading-snug text-zinc-800 dark:text-gray-100">
                        {wallet.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {selectedWallet && (
                <div
                  ref={formSectionRef}
                  className={`choice-card space-y-3 rounded-xl px-4 py-4 ${
                    votesClosed ? "pointer-events-none opacity-45" : ""
                  }`}
                >
                  <WalletOperatorHints walletId={selectedWallet} dvPassActive={dvPassActive} />

                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-500 dark:text-gray-400" htmlFor="pay-phone">
                      {selectedWallet === "orange_ci" && "Votre numéro Orange Money"}
                      {selectedWallet === "mtn_ci" && "Votre numéro MTN MoMo"}
                      {selectedWallet === "moov_ci" && "Votre numéro Moov Money"}
                      {selectedWallet === "wave_ci" && "Votre numéro Wave"}
                    </label>
                    <input
                      id="pay-phone"
                      type="tel"
                      autoComplete="tel"
                      placeholder="Ex. 0701020304"
                      className={`${inputBase} border-zinc-200 dark:border-white/15`}
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                    />
                  </div>

                  {needsOtp && (
                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-500 dark:text-gray-400" htmlFor="pay-otp">
                        {dvPassActive
                          ? "Code PIN / OTP (USSD #144*82# ou SMS selon opérateur)"
                          : "Code OTP (SMS)"}
                      </label>
                      <input
                        id="pay-otp"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={otpMaxLength}
                        placeholder={
                          isOrangeWallet && !dvPassActive ? "4 chiffres (ex. 1234)" : "Ex. 123456"
                        }
                        className={`${inputBase} border-zinc-200 dark:border-white/15`}
                        value={otpCode}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "").slice(0, otpMaxLength);
                          setOtpCode(digits);
                        }}
                      />
                      {isOrangeWallet && !dvPassActive && (
                        <p className="text-[10px] text-zinc-500 dark:text-gray-500">
                          Composez{" "}
                          <span className="font-mono font-semibold text-zinc-700 dark:text-gray-300">#144*82#</span> sur
                          votre téléphone pour recevoir le code.
                        </p>
                      )}
                      {isOrangeWallet && dvPassActive && (
                        <p className="text-[10px] text-zinc-500 dark:text-gray-500">
                          Orange : vous pouvez obtenir un OTP via{" "}
                          <span className="font-mono font-semibold text-zinc-700 dark:text-gray-300">#144*82#</span> si
                          l&apos;opérateur le demande.
                        </p>
                      )}
                    </div>
                  )}

                  {error && <p className="text-[11px] font-medium text-red-600 dark:text-red-400">{error}</p>}

                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={loading || votesClosed || !paymentActive}
                    className="pay-modal-primary mt-1 w-full cursor-pointer rounded-xl bg-[var(--nci-navy)] py-2.5 text-xs font-semibold text-white hover:opacity-[0.96] disabled:cursor-not-allowed disabled:opacity-45 dark:disabled:opacity-[0.15]"
                  >
                    {votesClosed
                      ? RESPONSE_COPY.responsesClosed
                      : loading
                        ? "Préparation du paiement..."
                        : `Confirmer et payer ${totalAmount.toLocaleString("fr-FR")} FCFA`}
                  </button>
                </div>
              )}

              <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-gray-500">
                Après le paiement, vous reviendrez sur le site et vos réponses seront comptabilisées une fois la
                transaction confirmée.
              </p>
              <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-gray-500">
                En poursuivant, vous acceptez que vos coordonnées soient utilisées pour le suivi des réponses et pour vous
                contacter en cas de récompense des meilleurs votants.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
