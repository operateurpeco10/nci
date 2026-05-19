import type { DvPassConfig } from "./config";
import { dvPassMerchantFetchHeaders } from "./http";

/** Corps POST /purchase/sendoptin/ (doc V2.1 — sans `pin`). */
export type DvPassSendOptInBody = {
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
  paymentMethod: string;
  invoice?: { amount: number };
};

export async function dvPassPurchaseSendOptIn(
  config: DvPassConfig,
  bearerJwt: string,
  body: DvPassSendOptInBody
): Promise<{
  ok: boolean;
  status: number;
  json: unknown;
  text: string | null;
  responseHeaders: Record<string, string>;
}> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/purchase/sendoptin/`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...dvPassMerchantFetchHeaders(),
      Authorization: `Bearer ${bearerJwt}`,
      "Content-Type": "application/json",
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
