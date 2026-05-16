"use client";

import { motion } from "framer-motion";
import { Check, Sparkles, TrendingUp, Crown, Info } from "lucide-react";
import { VOTE_PACKS, formatPriceFcfa } from "@/lib/votePacks";
import type { VotePack } from "@/types/digima";

interface VotePackSelectorProps {
  selectedPackId?: string;
  onPackSelect: (pack: VotePack) => void;
  /** Alignement visuel type projet VoteMinimal (cartes fines + accent bleu) */
  variant?: "default" | "minimal";
}

export default function VotePackSelector({
  selectedPackId,
  onPackSelect,
  variant = "default",
}: VotePackSelectorProps) {
  const minimal = variant === "minimal";

  const getPackIcon = (pack: VotePack) => {
    if (pack.label === "VIP") return <Crown className="h-5 w-5" />;
    if (pack.label === "Meilleur rapport") return <TrendingUp className="h-5 w-5" />;
    if (pack.label === "Populaire") return <Sparkles className="h-5 w-5" />;
    return null;
  };

  return (
    <div className="space-y-3">
      <div className="text-center">
        <h3
          className={
            minimal
              ? "text-sm font-semibold text-zinc-800 dark:text-white"
              : "text-sm font-semibold text-white"
          }
        >
          Choisissez votre pack de votes
        </h3>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {VOTE_PACKS.map((pack, index) => {
          const isSelected = selectedPackId === pack.id;
          const isBestValue = pack.label === "Meilleur rapport";

          if (minimal) {
            return (
              <motion.button
                key={pack.id}
                type="button"
                onClick={() => onPackSelect(pack)}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.04 }}
                className={`choice-card relative flex cursor-pointer flex-col items-center overflow-hidden rounded-lg p-2.5 text-center sm:rounded-xl sm:p-4 ${
                  isSelected ? "selected" : ""
                } ${isBestValue ? "ring-2 ring-[var(--nci-navy)]/35 dark:ring-[var(--nci-navy)]/30" : ""}`}
              >
                {pack.label && (
                  <div className="absolute right-1 top-1 flex items-center gap-0.5 rounded-full bg-zinc-100/95 px-1 py-0.5 text-[8px] font-semibold text-zinc-700 backdrop-blur-sm dark:bg-black/55 dark:text-white sm:right-2 sm:top-2 sm:gap-1 sm:px-2 sm:py-0.5 sm:text-[10px]">
                    {getPackIcon(pack)}
                    <span>{pack.label}</span>
                  </div>
                )}

                {isSelected && (
                  <div className="absolute left-1/2 top-1.5 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full bg-[var(--nci-navy)] sm:top-2 sm:h-5 sm:w-5">
                    <Check className="h-2.5 w-2.5 text-white sm:h-3 sm:w-3" aria-hidden />
                  </div>
                )}

                <div className="mb-1 mt-5 w-full sm:mb-2 sm:mt-6">
                  <div className="text-xl font-bold tabular-nums text-zinc-900 dark:text-white sm:text-3xl">
                    {pack.votes.toLocaleString("fr-FR")}
                  </div>
                  <div className="text-[10px] text-zinc-500 dark:text-gray-400 sm:text-xs">
                    {pack.votes === 1 ? "vote" : "votes"}
                  </div>
                </div>

                <div className="text-[11px] font-semibold tabular-nums leading-tight text-[var(--nci-navy)] sm:text-sm">
                  {formatPriceFcfa(pack.price_fcfa)}
                </div>

                {pack.label === "VIP" && (
                  <div className="mt-2 rounded bg-gradient-to-r from-[var(--nci-navy)] to-[var(--nci-navy-hover)] px-2 py-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-white">
                    Soutien maximum
                  </div>
                )}
              </motion.button>
            );
          }

          return (
            <motion.button
              key={pack.id}
              type="button"
              onClick={() => onPackSelect(pack)}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              className={`
                relative flex cursor-pointer flex-col items-center overflow-hidden rounded-lg border-2 p-2.5 text-center transition-all sm:rounded-xl sm:p-4
                ${
                  isSelected
                    ? "border-[var(--primary)] bg-[var(--primary)]/10 shadow-lg shadow-[var(--primary)]/20"
                    : "border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10"
                }
                ${isBestValue ? "ring-2 ring-[var(--secondary)]/50" : ""}
              `}
            >
              {pack.label && (
                <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                  {getPackIcon(pack)}
                  <span>{pack.label}</span>
                </div>
              )}

              {isSelected && (
                <div className="absolute left-1/2 top-1.5 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full bg-[var(--primary)] sm:top-2 sm:h-5 sm:w-5">
                  <Check className="h-2.5 w-2.5 text-black sm:h-3 sm:w-3" />
                </div>
              )}

              <div className="mb-1 mt-5 w-full sm:mb-2 sm:mt-6">
                <div className="text-xl font-bold tabular-nums text-white sm:text-3xl">{pack.votes.toLocaleString("fr-FR")}</div>
                <div className="text-[10px] text-gray-400 sm:text-xs">{pack.votes === 1 ? "vote" : "votes"}</div>
              </div>

              <div className="text-[11px] font-semibold tabular-nums leading-tight text-[var(--primary)] sm:text-sm">
                {formatPriceFcfa(pack.price_fcfa)}
              </div>

              {pack.label === "VIP" && (
                <div className="mt-2 rounded bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] px-2 py-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-black">
                  Soutien maximum
                </div>
              )}
            </motion.button>
          );
        })}
      </div>

      <div
        className={
          minimal
            ? "choice-card rounded-xl p-3 text-xs text-zinc-600 dark:text-gray-400"
            : "rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-gray-400"
        }
      >
        <p className="flex items-start gap-2">
          <Info
            className={`mt-0.5 h-4 w-4 shrink-0 ${minimal ? "text-[var(--nci-navy)]" : "text-[var(--primary)]"}`}
            aria-hidden
          />
          <span>
            Plus vous votez, plus vous avez des chances de remporter le gros lot.
          </span>
        </p>
      </div>
    </div>
  );
}
