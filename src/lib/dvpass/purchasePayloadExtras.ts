/**
 * Champs optionnels doc DVPass Web & Mobile Payment API (validate / sendoptin / forward).
 * @see exemples officiels correlationId, user, data.*, customization, pin, paymentMethod
 */

export type DvPassPurchaseDataBlock = {
  meta: string;
  adNetwork?: string;
  adId?: string;
  clickId?: string;
  clientId?: string;
};

export type DvPassPurchaseCustomization = {
  layoutId?: string;
  commercialName?: string;
};

/** `data` : meta obligatoire côté app (≤100 car.) + clés optionnelles depuis l’env. */
export function buildDvPassPurchaseData(meta: string): DvPassPurchaseDataBlock {
  const metaTrim = meta.trim().slice(0, 100);
  const out: DvPassPurchaseDataBlock = { meta: metaTrim };

  const pick = (key: keyof DvPassPurchaseDataBlock, env: string) => {
    const v = process.env[env]?.trim();
    if (v !== undefined && v !== "") out[key] = v;
  };

  pick("adNetwork", "DVPASS_DATA_AD_NETWORK");
  pick("adId", "DVPASS_DATA_AD_ID");
  pick("clickId", "DVPASS_DATA_CLICK_ID");
  if (process.env.DVPASS_DATA_CLIENT_ID !== undefined) {
    out.clientId = process.env.DVPASS_DATA_CLIENT_ID.trim();
  }

  return out;
}

/** Personnalisation hébergée (certains opérateurs) — doc `customization.layoutId` / `commercialName`. */
export function getDvPassPurchaseCustomization(): DvPassPurchaseCustomization | undefined {
  const layoutId = process.env.DVPASS_CUSTOMIZATION_LAYOUT_ID?.trim();
  const commercialName = process.env.DVPASS_CUSTOMIZATION_COMMERCIAL_NAME?.trim();
  if (!layoutId && !commercialName) return undefined;
  const o: DvPassPurchaseCustomization = {};
  if (layoutId) o.layoutId = layoutId;
  if (commercialName) o.commercialName = commercialName;
  return o;
}
