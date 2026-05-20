"use client";

import PaymentModal from "@/components/PaymentModal";
import { ThemeSwitch } from "@/components/theme-switch";
import { accentForDisplayIndex } from "@/lib/pollChoices";
import { RESPONSE_COPY, formatTotalResponses } from "@/lib/responseCopy";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const BAR_STYLES = [
  { color: "var(--nci-green)", trackVar: "--bar-track-0" as const },
  { color: "var(--nci-orange)", trackVar: "--bar-track-1" as const },
] as const;

type PollChoice = {
  id: string;
  label: string;
  votes: number;
};

type View = "vote" | "results";

export default function Home() {
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [pollChoices, setPollChoices] = useState<PollChoice[]>([]);
  const [pollLoading, setPollLoading] = useState(true);
  const [view, setView] = useState<View>("vote");
  const [barsReady, setBarsReady] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; size: number }[]>([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const rippleSeq = useRef(0);
  const voteBtnRef = useRef<HTMLButtonElement>(null);

  const loadPoll = useCallback(async () => {
    try {
      const res = await fetch("/api/poll/results", { cache: "no-store" });
      const data = (await res.json()) as {
        success?: boolean;
        question?: string | null;
        choices?: PollChoice[];
      };
      if (data.success && Array.isArray(data.choices)) {
        setPollChoices(data.choices);
      }
      if (typeof data.question === "string") {
        setQuestion(data.question.trim());
      }
    } catch {
      /* ignore */
    } finally {
      setPollLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPoll();
  }, [loadPoll]);

  const totals = useMemo(
    () => pollChoices.map((c) => c.votes),
    [pollChoices]
  );

  const totalAll = totals.reduce((a, b) => a + b, 0);
  const maxVotes = Math.max(...totals, 0);

  const selected = selectedChoice !== null ? pollChoices[selectedChoice] : null;

  useEffect(() => {
    if (view !== "results") {
      setBarsReady(false);
      return;
    }
    const id = requestAnimationFrame(() => {
      window.setTimeout(() => setBarsReady(true), 50);
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
    [selectChoice]
  );

  const addRipple = useCallback(() => {
    const btn = voteBtnRef.current;
    const size = btn
      ? Math.max(btn.getBoundingClientRect().width, btn.getBoundingClientRect().height)
      : 0;
    const id = ++rippleSeq.current;
    setRipples((r) => [...r, { id, size }]);
    window.setTimeout(() => {
      setRipples((r) => r.filter((x) => x.id !== id));
    }, 600);
  }, []);

  const openPaymentModal = useCallback(() => {
    if (selectedChoice === null || !selected) return;
    addRipple();
    setPaymentOpen(true);
  }, [addRipple, selected, selectedChoice]);

  const handlePaymentComplete = useCallback(async () => {
    setPaymentOpen(false);
    await loadPoll();
    setView("results");
  }, [loadPoll]);

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
      <ThemeSwitchFloating />
      <main className="flex min-h-0 flex-1 flex-col items-center justify-start pt-14 sm:justify-center sm:pt-[max(1.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto w-full max-w-lg px-6 py-10 sm:max-w-2xl sm:py-12">
          {view === "vote" && (
            <div>
              <div className="text-center">
                <div className="relative mx-auto mb-4 h-[5.25rem] w-[min(340px,94vw)] fade-in sm:mb-6 sm:h-20 sm:w-[min(360px,88vw)]">
                  <Image
                    src="/images/logo_nci.png"
                    alt="NCI"
                    fill
                    className="object-contain object-center"
                    sizes="(max-width: 640px) 94vw, 360px"
                    priority
                  />
                </div>
                <VoteIntro />
                <h1 className="text-xl sm:text-2xl font-semibold leading-snug tracking-tight text-zinc-900 fade-in fade-in-delay-2 dark:text-white/90">
                  {pollLoading && !question
                    ? "Chargement…"
                    : question || "Question du sondage"}
                </h1>
              </div>

              <div className="glow-line my-8 fade-in fade-in-delay-2" />

              {pollLoading && pollChoices.length === 0 ? (
                <p className="text-center text-sm text-zinc-500 dark:text-white/40">
                  Chargement des choix…
                </p>
              ) : pollChoices.length === 0 ? (
                <p className="text-center text-sm text-zinc-500 dark:text-white/40">
                  Aucun choix configuré pour le moment.
                </p>
              ) : (
                <div
                  className={`grid gap-3 fade-in fade-in-delay-3 ${
                    pollChoices.length <= 2 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"
                  }`}
                >
                  {pollChoices.map((c, i) => {
                    const accent = accentForDisplayIndex(i);
                    return (
                      <div
                        key={c.id}
                        role="radio"
                        aria-checked={selectedChoice === i}
                        tabIndex={0}
                        onClick={() => selectChoice(i)}
                        onKeyDown={(e) => onChoiceKeyDown(e, i)}
                        className={`choice-card choice-card--${accent} rounded-xl px-5 py-6 cursor-pointer flex flex-col items-center gap-3 text-center ${selectedChoice === i ? "selected" : ""}`}
                      >
                        <span
                          className={`text-sm font-bold tracking-wide uppercase ${accent === "cafe" ? "text-nci-green" : "text-nci-orange"}`}
                        >
                          {String.fromCharCode(65 + i)}
                        </span>
                        <div className="radio-dot flex-shrink-0" />
                        <span
                          className={`text-base font-medium tracking-wide ${selectedChoice === i ? "text-zinc-900 dark:text-white" : "text-zinc-600 dark:text-white/70"}`}
                        >
                          {c.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-8 fade-in fade-in-delay-4">
                <button
                  ref={voteBtnRef}
                  type="button"
                  disabled={selectedChoice === null || !selected}
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
            <div className="results-panel space-y-5 result-animate">
              <ResultsHeader />
              <ResultsBars
                choices={pollChoices}
                totals={totals}
                totalAll={totalAll}
                maxVotes={maxVotes}
                barsReady={barsReady}
              />
              <div className="glow-line my-6" />
              <p className="text-center text-sm font-medium tracking-wide text-zinc-800 dark:text-white/90">
                {formatTotalResponses(totalAll)}
              </p>
              <button
                type="button"
                onClick={resetVote}
                className="w-full py-3 rounded-xl border border-zinc-300/90 bg-white/40 text-zinc-800 font-medium text-xs tracking-wide transition-all duration-300 hover:bg-white/60 dark:border-white/25 dark:bg-white/10 dark:text-white/90 dark:hover:bg-white/15"
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
        coupleName={selected?.label}
        choiceId={selected?.id}
        onPaymentComplete={() => void handlePaymentComplete()}
      />
    </>
  );
}

function ThemeSwitchFloating() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-end p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))]">
      <div className="pointer-events-auto rounded-full border border-zinc-200/90 bg-white/90 p-1 shadow-lg shadow-zinc-900/10 backdrop-blur-sm dark:border-white/10 dark:bg-[var(--dark-surface-bg)]/90 dark:shadow-black/40">
        <ThemeSwitch />
      </div>
    </div>
  );
}

function VoteIntro() {
  return (
    <div className="fade-in fade-in-delay-1 mx-auto mb-6 max-w-md space-y-3 text-center sm:mb-8 sm:max-w-none sm:w-full">
      <p className="text-base font-medium leading-snug text-zinc-600 sm:text-lg sm:whitespace-nowrap dark:text-white/75">
        Question de la semaine sur NCI.
      </p>
      <p className="acroche-blink text-3xl font-semibold leading-snug text-zinc-800 sm:text-4xl sm:whitespace-nowrap dark:text-white/90">
        <span className="font-semibold text-nci-orange">10&nbsp;MILLIONS</span> à se partager.
      </p>
    </div>
  );
}

function ResultsHeader() {
  return (
    <>
      <div className="relative mx-auto h-14 w-[min(260px,72vw)] sm:h-16 sm:w-[min(300px,75vw)]">
        <Image
          src="/images/logo_nci.png"
          alt="NCI"
          fill
          className="object-contain object-center"
          sizes="(max-width: 640px) 72vw, 300px"
        />
      </div>
      <p className="text-xs tracking-[0.25em] uppercase text-zinc-600 text-center dark:text-white/70">
        Résultats
      </p>
    </>
  );
}

function ResultsBars({
  choices,
  totals,
  totalAll,
  maxVotes,
  barsReady,
}: {
  choices: PollChoice[];
  totals: number[];
  totalAll: number;
  maxVotes: number;
  barsReady: boolean;
}) {
  return (
    <div className="space-y-4">
      {choices.map((c, i) => {
        const v = totals[i] ?? 0;
        const pct = totalAll > 0 ? Math.round((v / totalAll) * 100) : 0;
        const isWinner = v === maxVotes && maxVotes > 0;
        const bar = BAR_STYLES[i % BAR_STYLES.length];
        return (
          <div key={c.id}>
            <div className="flex justify-between items-baseline mb-2">
              <span
                className={`text-sm font-semibold tracking-wide ${isWinner ? "text-zinc-900 dark:text-white" : "text-zinc-700 dark:text-white/75"}`}
              >
                {c.label}
              </span>
              <span
                className={`text-sm font-bold tabular-nums ${isWinner ? "" : "text-zinc-600 dark:text-white/55"}`}
                style={isWinner ? { color: bar.color } : undefined}
              >
                {pct}%
              </span>
            </div>
            <div
              className="h-2.5 rounded-full overflow-hidden"
              style={{ background: `var(${bar.trackVar})` }}
            >
              <div
                className="result-bar h-full rounded-full shadow-sm"
                style={{
                  width: barsReady
                    ? `${totalAll > 0 && v > 0 ? Math.max(pct, 6) : 0}%`
                    : "0%",
                  background: bar.color,
                  opacity: isWinner ? 1 : 0.75,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
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
