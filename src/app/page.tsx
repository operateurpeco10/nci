"use client";

import PaymentModal from "@/components/PaymentModal";
import { ThemeSwitch } from "@/components/theme-switch";
import { RESPONSE_COPY, formatTotalResponses } from "@/lib/responseCopy";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const BASE_VOTES = [47, 38] as const;
const CHOICES = [
  { label: "Café", accent: "cafe" as const },
  { label: "Thé", accent: "the" as const },
] as const;
const BAR_STYLES = [
  { color: "var(--nci-green)", trackVar: "--bar-track-0" as const },
  { color: "var(--nci-orange)", trackVar: "--bar-track-1" as const },
] as const;

type View = "vote" | "results";

export default function Home() {
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [userVotes, setUserVotes] = useState<[number, number]>([0, 0]);
  const [view, setView] = useState<View>("vote");
  const [barsReady, setBarsReady] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; size: number }[]>([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const rippleSeq = useRef(0);
  const voteBtnRef = useRef<HTMLButtonElement>(null);

  const totals = useMemo(
    () => CHOICES.map((_, i) => userVotes[i] + BASE_VOTES[i]),
    [userVotes],
  );
  const totalAll = totals.reduce((a, b) => a + b, 0);
  const maxVotes = Math.max(...totals);

  useEffect(() => {
    if (view !== "results") {
      setBarsReady(false);
      return;
    }
    const id = requestAnimationFrame(() => {
      setTimeout(() => setBarsReady(true), 50);
    });
    return () => cancelAnimationFrame(id);
  }, [view]);

  const selectChoice = useCallback((index: number) => {
    setSelectedChoice(index);
  }, []);

  const onChoiceKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectChoice(index);
      }
    },
    [selectChoice],
  );

  const addRipple = useCallback(() => {
    const btn = voteBtnRef.current;
    const size = btn
      ? Math.max(
          btn.getBoundingClientRect().width,
          btn.getBoundingClientRect().height,
        )
      : 0;
    const id = ++rippleSeq.current;
    setRipples((r) => [...r, { id, size }]);
    window.setTimeout(() => {
      setRipples((r) => r.filter((x) => x.id !== id));
    }, 600);
  }, []);

  const openPaymentModal = useCallback(() => {
    if (selectedChoice === null) return;
    addRipple();
    setPaymentOpen(true);
  }, [addRipple, selectedChoice]);

  const handleDemoPaymentComplete = useCallback(
    (detail: { nbVotes: number }) => {
      if (selectedChoice === null) return;
      setPaymentOpen(false);
      setUserVotes((uv) => {
        const next: [number, number] = [...uv];
        next[selectedChoice] += detail.nbVotes;
        return next;
      });
      setView("results");
    },
    [selectedChoice],
  );

  const cancelPayment = useCallback(() => {
    setPaymentOpen(false);
  }, []);

  const resetVote = useCallback(() => {
    setSelectedChoice(null);
    setPaymentOpen(false);
    setView("vote");
  }, []);

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-end p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))]"
      >
        <div className="pointer-events-auto rounded-full border border-zinc-200/90 bg-white/90 p-1 shadow-lg shadow-zinc-900/10 backdrop-blur-sm dark:border-white/10 dark:bg-[var(--dark-surface-bg)]/90 dark:shadow-black/40">
          <ThemeSwitch />
        </div>
      </div>

      <main className="flex flex-1 items-center justify-center pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="mx-auto w-full max-w-lg px-6 py-10 sm:py-12">
          {view === "vote" && (
            <div>
              <div className="text-center">
                <div className="relative mx-auto mb-6 h-16 w-[min(300px,82vw)] fade-in sm:h-20 sm:w-[min(360px,88vw)]">
                  <Image
                    src="/images/logo_nci.png"
                    alt="NCI"
                    fill
                    className="object-contain object-center"
                    sizes="(max-width: 640px) 82vw, 360px"
                    priority
                  />
                </div>
                <p className="fade-in fade-in-delay-1 text-base leading-relaxed text-zinc-600 sm:text-lg mb-8 max-w-md mx-auto dark:text-white/70">
                  Réponds plusieurs fois à la bonne question et tente de repartir
                  avec{" "}
                  <span className="font-semibold tabular-nums text-nci-orange">
                    10&nbsp;000&nbsp;000
                  </span>{" "}
                  de francs.
                </p>
                <h1 className="text-2xl sm:text-3xl font-semibold leading-snug tracking-tight text-zinc-900 fade-in fade-in-delay-2 dark:text-white/90">
                  Café ou Thé ?
                </h1>
              </div>

              <div className="glow-line my-8 fade-in fade-in-delay-2" />

              <div className="grid grid-cols-2 gap-3 fade-in fade-in-delay-3">
                {CHOICES.map((c, i) => (
                  <div
                    key={c.label}
                    role="radio"
                    aria-checked={selectedChoice === i}
                    tabIndex={0}
                    onClick={() => selectChoice(i)}
                    onKeyDown={(e) => onChoiceKeyDown(e, i)}
                    className={`choice-card choice-card--${c.accent} rounded-xl px-5 py-6 cursor-pointer flex flex-col items-center gap-3 text-center ${selectedChoice === i ? "selected" : ""}`}
                  >
                    <span
                      className={`text-sm font-bold tracking-wide uppercase ${c.accent === "cafe" ? "text-nci-green" : "text-nci-orange"}`}
                    >
                      {i === 0 ? "A" : "B"}
                    </span>
                    <div className="radio-dot flex-shrink-0" />
                    <span
                      className={`text-base font-medium tracking-wide ${selectedChoice === i ? "text-zinc-900 dark:text-white" : "text-zinc-600 dark:text-white/70"}`}
                    >
                      {c.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-8 fade-in fade-in-delay-4">
                <button
                  ref={voteBtnRef}
                  type="button"
                  disabled={selectedChoice === null}
                  onClick={openPaymentModal}
                  className="vote-btn w-full py-3.5 rounded-xl font-semibold text-sm tracking-wide disabled:transform-none"
                >
                  {ripples.map((r) => (
                    <Ripple key={r.id} size={r.size} />
                  ))}
                  {RESPONSE_COPY.ctaValidate}
                </button>
              </div>
            </div>
          )}

          {view === "results" && (
            <div className="space-y-5 result-animate">
              <div className="relative mx-auto h-14 w-[min(260px,72vw)] sm:h-16 sm:w-[min(300px,75vw)]">
                <Image
                  src="/images/logo_nci.png"
                  alt="NCI"
                  fill
                  className="object-contain object-center"
                  sizes="(max-width: 640px) 72vw, 300px"
                />
              </div>
              <p className="text-xs tracking-[0.25em] uppercase text-zinc-500 text-center dark:text-white/25">
                Résultats
              </p>

              <div className="space-y-4">
                {CHOICES.map((c, i) => {
                  const v = totals[i];
                  const pct =
                    totalAll > 0 ? Math.round((v / totalAll) * 100) : 0;
                  const isWinner = v === maxVotes;
                  const bar = BAR_STYLES[i];
                  return (
                    <div key={c.label}>
                      <div className="flex justify-between items-baseline mb-2">
                        <span
                          className={`text-sm font-medium tracking-wide ${isWinner ? "text-zinc-900 dark:text-white" : "text-zinc-500 dark:text-white/50"}`}
                        >
                          {c.label}
                        </span>
                        <span
                          className={`text-sm font-semibold tabular-nums ${isWinner ? "" : "text-zinc-400 dark:text-white/40"}`}
                          style={isWinner ? { color: bar.color } : undefined}
                        >
                          {pct}%
                        </span>
                      </div>
                      <div
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{
                          background: `var(${bar.trackVar})`,
                        }}
                      >
                        <div
                          className="result-bar h-full rounded-full"
                          style={{
                            width: barsReady ? `${pct}%` : "0%",
                            background: bar.color,
                            opacity: isWinner ? 0.8 : 0.35,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="glow-line my-6" />

              <p className="text-center text-xs text-zinc-500 tracking-wide dark:text-white/20">
                {formatTotalResponses(totalAll)}
              </p>

              <button
                type="button"
                onClick={resetVote}
                className="w-full py-3 rounded-xl border border-zinc-200 text-zinc-500 font-medium text-xs tracking-wide transition-all duration-300 hover:border-nci-navy/35 hover:text-zinc-700 dark:border-white/8 dark:text-white/30 dark:hover:border-nci-navy/40 dark:hover:text-white/50"
              >
                {RESPONSE_COPY.ctaAgain}
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="w-full border-t border-zinc-200/90 dark:border-white/5">
        <div className="mx-auto max-w-lg px-6 py-4 text-center">
          <span className="text-[11px] text-zinc-400 tracking-wide dark:text-white/15">
            © 2025 Grand jeu NCI
          </span>
        </div>
      </footer>

      <PaymentModal
        isOpen={paymentOpen}
        onClose={cancelPayment}
        coupleName={
          selectedChoice !== null ? CHOICES[selectedChoice].label : undefined
        }
        onDemoPaymentComplete={handleDemoPaymentComplete}
      />
    </>
  );
}

function Ripple({ size }: { size: number }) {
  const half = size / 2;
  return (
    <span
      className="ripple"
      style={{
        width: size,
        height: size,
        left: "50%",
        top: "50%",
        marginLeft: -half,
        marginTop: -half,
      }}
    />
  );
}
