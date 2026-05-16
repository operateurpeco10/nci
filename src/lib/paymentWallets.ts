/**
 * Logos attendus dans `public/images/logo/` (même idée que voting-nestor, sous-dossier dédié) :
 * - om.jpg       → Orange Money
 * - mtn.jpg      → MTN Mobile Money
 * - moov.jpg     → Moov Money
 * - wave.jpg     → Wave
 *
 * Tu peux remplacer par .png / .webp : adapte les chemins ci-dessous.
 */
export const PAYMENT_WALLETS = [
  { id: "orange_ci", name: "Orange Money", icon: "/images/logo/om.jpg" },
  { id: "mtn_ci", name: "MTN Mobile Money", icon: "/images/logo/mtn.jpg" },
  { id: "moov_ci", name: "Moov Money", icon: "/images/logo/moov.jpg" },
  { id: "wave_ci", name: "Wave", icon: "/images/logo/wave.jpg" },
] as const;

export type PaymentWalletId = (typeof PAYMENT_WALLETS)[number]["id"];

/** Comportement agrégateur (réf. voting-nestor) — simplifié pour la démo */
export function getWalletDvPassFlow(walletId: string): "validate" | "push" | null {
  switch (walletId) {
    case "orange_ci":
    case "mtn_ci":
    case "moov_ci":
      return "validate";
    case "wave_ci":
      return "push";
    default:
      return null;
  }
}

