function parseOptionalInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

export type DvPassConfig = {
  baseUrl: string;
  merchantId: string;
  secret: string;
  /** Optionnel ici: peut venir de la matrice DVPASS_AUDIENCE_BY_VOTES par palier de votes. */
  packageId?: number;
  serviceId?: number;
  productId?: number;
  offerId?: number;
};

export function hostFromDvPassBaseUrl(baseUrl: string): string {
  return new URL(baseUrl).host;
}

export function getDvPassConfig(): DvPassConfig | null {
  const rawBase = process.env.DVPASS_API_BASE_URL?.trim();
  const merchantId = process.env.DVPASS_MERCHANT_ID?.trim();
  const secret = process.env.DVPASS_MERCHANT_SECRET?.trim();
  const packRaw = process.env.DVPASS_PACKAGE_ID?.trim();

  if (!rawBase || !merchantId || !secret) return null;

  let baseUrl: string;
  try {
    baseUrl = new URL(rawBase).origin;
  } catch {
    return null;
  }

  const packageId =
    packRaw === undefined || packRaw === "" ? undefined : parseOptionalInt(packRaw);
  if (packRaw && packageId === undefined) return null;

  return {
    baseUrl,
    merchantId,
    secret,
    packageId,
    serviceId: parseOptionalInt(process.env.DVPASS_SERVICE_ID),
    productId: parseOptionalInt(process.env.DVPASS_PRODUCT_ID),
    offerId: parseOptionalInt(process.env.DVPASS_OFFER_ID),
  };
}

export function isDvPassConfigured(): boolean {
  return getDvPassConfig() !== null;
}

/**
 * URL HTTPS publique du callback après flux Forward (Wave), sans ?query.
 * Doit être identique à l’URL déclarée dans le JWT et utilisée pour la vérification de signature (V2.1 §5.1).
 */
export function getDvPassPurchaseCallbackUrl(): string | null {
  const raw = process.env.DVPASS_PURCHASE_CALLBACK_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.origin}${path}`;
  } catch {
    return null;
  }
}

/**
 * DV signe avec l’URL exacte du callback (JWT). Souvent mismatch www vs apex : on teste les deux.
 */
export function expandDvPassCallbackBaseUrls(callbackBaseUrl: string | string[]): string[] {
  const raw = Array.isArray(callbackBaseUrl) ? callbackBaseUrl : [callbackBaseUrl];
  const normalized: string[] = [];
  for (const b of raw) {
    const t = b.trim();
    if (!t) continue;
    try {
      const u = new URL(t);
      const path = u.pathname.replace(/\/+$/, "") || "/";
      normalized.push(`${u.origin}${path}`);
    } catch {
      normalized.push(t);
    }
  }
  const out: string[] = [];
  for (const b of normalized) {
    out.push(b);
    try {
      const u = new URL(b);
      const h = u.hostname;
      if (h.startsWith("www.")) {
        const alt = new URL(b);
        alt.hostname = h.slice(4);
        const p = alt.pathname.replace(/\/+$/, "") || "/";
        out.push(`${alt.origin}${p}`);
      } else if (h) {
        const alt = new URL(b);
        alt.hostname = `www.${h}`;
        const p = alt.pathname.replace(/\/+$/, "") || "/";
        out.push(`${alt.origin}${p}`);
      }
    } catch {
      // ignore
    }
  }
  return [...new Set(out)];
}
