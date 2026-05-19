import type { DvPassConfig } from "./config";
import { dvPassMerchantFetchHeaders } from "./http";

export type DvPassValidateBody = {
  correlationId: string;
  user: {
    msisdn: string;
    mccmnc: number;
    userAgent?: string;
    ip?: string;
    locale?: string;
    referer?: string;
  };
  data?: {
    meta?: string;
    adNetwork?: string;
    adId?: string;
    clickId?: string;
    clientId?: string;
  };
  customization?: {
    layoutId?: string;
    commercialName?: string;
  };
  pin: string;
  paymentMethod: string;
  /** Doc V2.1 — montant dynamique (FCFA entier côté app). */
  invoice?: { amount: number };
};

/**
 * Normalise un numéro CI vers format DVPass attendu.
 * DVPass CI accepte: 0758976764 (format local avec 0 initial) ou +2250758976764 (E.164).
 * On préserve le 0 initial si présent (requis par DVPass).
 */
export function normalizeMsisdnCi(phone: string): string {
  const cleaned = phone.replace(/\s+/g, "").trim();

  // Si commence par +225, garder tel quel
  if (cleaned.startsWith("+225")) return cleaned;

  // Si commence par 225 sans +, ajouter le +
  if (cleaned.startsWith("225") && cleaned.length >= 12) return `+${cleaned}`;

  // Si commence par 0 (format local CI), ajouter +225 SANS retirer le 0
  if (cleaned.startsWith("0") && cleaned.length >= 10) return `+225${cleaned}`;

  // Si commence par + mais pas +225, garder tel quel
  if (cleaned.startsWith("+")) return cleaned;

  // Sinon, ajouter +225 devant
  return `+225${cleaned}`;
}

export async function dvPassPurchaseValidate(
  config: DvPassConfig,
  bearerJwt: string,
  body: DvPassValidateBody
): Promise<{
  ok: boolean;
  status: number;
  json: unknown;
  text: string | null;
  responseHeaders: Record<string, string>;
}> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/purchase/validate/`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerJwt}`,
      "Content-Type": "application/json",
      "User-Agent": "DVPassTest/1.0",
    },
    body: JSON.stringify(body),
  });

  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = null;
    }
  }

  return { ok: res.ok, status: res.status, json, text: text || null, responseHeaders };
}

export function extractDvPassErrorMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const msg = o.message ?? o.error ?? o.detail;
  if (typeof msg === "string" && msg.trim()) return msg;
  return null;
}
