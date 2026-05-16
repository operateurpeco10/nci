"use client";

import { fireResponseConfetti } from "@/lib/confetti";
import {
  RESPONSE_COPY,
  formatRegisteredResponses,
} from "@/lib/responseCopy";
import { motion } from "framer-motion";
import { CheckCircle2, Sparkles } from "lucide-react";
import { useEffect } from "react";

export interface VoteSuccessOverlayProps {
  votes: number;
  name: string;
}

export function VoteSuccessOverlay({ votes, name }: VoteSuccessOverlayProps) {
  useEffect(() => {
    fireResponseConfetti();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="pointer-events-none absolute inset-0 z-[90] flex items-center justify-center rounded-2xl bg-black/35 px-4"
      role="status"
      aria-live="polite"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.68, rotate: -8 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: -8 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-emerald-300/45 bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 p-7 shadow-[0_18px_70px_rgba(16,185,129,0.45)]"
      >
        <motion.div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/20 blur-2xl" aria-hidden />
        <motion.div className="absolute -bottom-8 -left-8 h-28 w-28 rounded-full bg-black/15 blur-2xl" aria-hidden />

        <motion.div className="relative text-center text-white">
          <motion.div className="relative mx-auto mb-4 flex h-20 w-20 items-center justify-center">
            <motion.div
              className="absolute inset-0 rounded-full bg-white/40"
              animate={{ scale: [1, 1.45, 1], opacity: [0.55, 0, 0.55] }}
              transition={{ duration: 1.15, repeat: Infinity, ease: "easeOut" }}
            />
            <motion.div className="relative rounded-full bg-white p-4 shadow-xl">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden />
            </motion.div>
          </motion.div>

          <h3 className="mb-1 flex items-center justify-center gap-2 text-2xl font-extrabold">
            <Sparkles className="h-5 w-5" aria-hidden />
            {RESPONSE_COPY.successTitle}
            <Sparkles className="h-5 w-5" aria-hidden />
          </h3>
          <p className="text-sm text-white/95">{formatRegisteredResponses(votes, name)}</p>

          <motion.div className="mt-4 inline-block rounded-full bg-white/20 px-4 py-1.5 text-xs font-medium backdrop-blur-sm">
            {RESPONSE_COPY.successThanks}
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
