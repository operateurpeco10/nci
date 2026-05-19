/**
 * wallet_id interne -> paymentMethod + mccmnc + flux DV Pass CI (matrice opérateur).
 * Libellés alignés sur la doc DV Pass Web & Mobile Payment API V2.1.
 * mccmnc : obligatoire validate/sendoptin ; Wave (forward) : ne pas envoyer par défaut (DVPass) — override DVPASS_WAVE_CI_MCCMNC si le CSM l’exige.
 */
export type DvPassWalletFlow = "validate" | "sendoptin" | "forward";

const WALLET_META: Record<
  string,
  { paymentMethod: string; mccmnc?: number; flow: DvPassWalletFlow }
> = {
  orange_ci: { paymentMethod: "Orange Money CI", mccmnc: 61203, flow: "validate" },
  mtn_ci: { paymentMethod: "MTN MoMo CI", mccmnc: 61205, flow: "sendoptin" },
  moov_ci: { paymentMethod: "Moov Money CI", mccmnc: 61202, flow: "sendoptin" },
  wave_ci: { paymentMethod: "Wave Mobile Money CI", flow: "forward" },
};

function parseEnvPositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Suffixe env : orange_ci -> ORANGE_CI (aligné DVPASS_ORANGE_CI_*). */
function walletEnvSuffix(walletId: string): string {
  return walletId.toUpperCase();
}

/**
 * Métadonnées DVPass pour un wallet, avec overrides serveur optionnels :
 * - DVPASS_{WALLET}_MCCMNC (ex. DVPASS_MTN_CI_MCCMNC ; Wave rare si le CSM impose un mccmnc)
 * - DVPASS_{WALLET}_PAYMENT_METHOD (libellé exact fourni par DV)
 */
export function getWalletDvPassMeta(walletId: string): {
  paymentMethod: string;
  mccmnc?: number;
  flow: DvPassWalletFlow;
} | null {
  const base = WALLET_META[walletId];
  if (!base) return null;

  const sfx = walletEnvSuffix(walletId);
  const mccOverride = parseEnvPositiveInt(process.env[`DVPASS_${sfx}_MCCMNC`]);
  const methodOverride = process.env[`DVPASS_${sfx}_PAYMENT_METHOD`]?.trim();

  const mccmnc =
    mccOverride !== undefined ? mccOverride : base.mccmnc;

  return {
    ...base,
    ...(mccmnc !== undefined ? { mccmnc } : {}),
    paymentMethod: methodOverride && methodOverride.length > 0 ? methodOverride : base.paymentMethod,
  };
}

export function getWalletDvPassFlow(walletId: string): DvPassWalletFlow | null {
  return WALLET_META[walletId]?.flow ?? null;
}
