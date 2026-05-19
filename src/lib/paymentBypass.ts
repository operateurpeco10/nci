import { readTruthyEnvVar } from "@/lib/readTruthyEnvVar";

/** Bypass tous les opérateurs (tests sans crédit MoMo). */
export function isPaymentBypassAllEnabled(): boolean {
  return readTruthyEnvVar("PAYMENT_BYPASS");
}

/** Bypass uniquement Wave (pas de popup / redirect DV). */
export function isPaymentBypassWaveEnabled(): boolean {
  return readTruthyEnvVar("PAYMENT_BYPASS_WAVE");
}

export function isPaymentBypassForWallet(walletId: string | undefined): boolean {
  if (isPaymentBypassAllEnabled()) return true;
  if (!walletId) return false;
  return walletId === "wave_ci" && isPaymentBypassWaveEnabled();
}
