import type { DvPassConfig } from "./config";
import { encryptDvPassForwardUserCollection } from "./forwardUserEncrypt";
import {
  buildDvPassJwtPayload,
  signDvPassJwt,
  type DvPassJwtAudience,
} from "./jwt";

/** Données `user` en clair (côté serveur avant signature du JWT Forward). */
export type DvPassForwardUserClear = {
  msisdn: string;
  /** Wave : omettre si absent (recommandation DVPass). */
  mccmnc?: number;
  userAgent?: string;
  ip?: string;
  locale?: string;
  referer?: string;
};

/** Objet `payload` du JWT pour GET /purchase/forward/:jwt (doc V2.1). `user` est chiffré dans le JWT (§5.3). */
export type DvPassForwardPurchasePayload = {
  correlationId: string;
  user: DvPassForwardUserClear | string;
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
  callback: string;
};

export function buildDvPassForwardJwt(
  config: DvPassConfig,
  purchase: DvPassForwardPurchasePayload,
  audienceOverrides: Partial<DvPassJwtAudience> | null = null
): Record<string, unknown> {
  return {
    ...buildDvPassJwtPayload(config, audienceOverrides),
    payload: purchase,
  };
}

/** URL complète à ouvrir côté client (navigateur ou WebView). */
export function buildDvPassForwardUrl(
  config: DvPassConfig,
  secret: string,
  purchase: Omit<DvPassForwardPurchasePayload, "user"> & { user: DvPassForwardUserClear },
  audienceOverrides: Partial<DvPassJwtAudience> | null = null
): string {
  const userEncrypted = encryptDvPassForwardUserCollection(
    { ...purchase.user } as Record<string, unknown>,
    purchase.correlationId,
    secret
  );
  const payloadForJwt: DvPassForwardPurchasePayload = {
    ...purchase,
    user: userEncrypted,
  };
  const jwt = signDvPassJwt(
    secret,
    buildDvPassForwardJwt(config, payloadForJwt, audienceOverrides)
  );
  const base = config.baseUrl.replace(/\/$/, "");
  const path = `${base}/purchase/forward/${encodeURIComponent(jwt)}`;
  const sessionId = process.env.DVPASS_PURCHASE_FORWARD_SESSION_ID?.trim();
  if (!sessionId) return path;
  const u = new URL(path);
  u.searchParams.set("sessionId", sessionId);
  return u.toString();
}
