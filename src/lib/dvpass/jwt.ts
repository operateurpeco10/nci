import { createHmac } from "crypto";

import type { DvPassConfig } from "./config";
import { hostFromDvPassBaseUrl } from "./config";
import { resolveDvPassMerchantSecretKey } from "./merchantSecretKey";

/**
 * Audience marchande (pack / offres par wallet) pour la config et les logs.
 * JWT Bearer : `iss`, `pack`, `sub`, `iat` (sans `exp` — demande CSM / alignement plateforme DVPass).
 */
export type DvPassJwtAudience = {
  packageId: number;
  serviceId?: number;
  productId?: number;
  offerId?: number;
};

export function mergeJwtAudience(
  config: DvPassConfig,
  overrides: Partial<DvPassJwtAudience>
): DvPassJwtAudience {
  const packageId = overrides.packageId ?? config.packageId;
  if (packageId === undefined) {
    throw new Error(
      "DVPass packageId manquant: renseignez DVPASS_PACKAGE_ID ou packageId dans DVPASS_AUDIENCE_BY_VOTES."
    );
  }
  return {
    packageId,
    serviceId:
      overrides.serviceId !== undefined ? overrides.serviceId : config.serviceId,
    productId:
      overrides.productId !== undefined ? overrides.productId : config.productId,
    offerId: overrides.offerId !== undefined ? overrides.offerId : config.offerId,
  };
}

function b64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function buildDvPassJwtPayload(
  config: DvPassConfig,
  audienceOverrides: Partial<DvPassJwtAudience> | null = null
): Record<string, number | string> {
  const aud = mergeJwtAudience(config, audienceOverrides ?? {});
  const sub = hostFromDvPassBaseUrl(config.baseUrl);
  const iat = Math.trunc(Date.now() / 1000);
  // Ordre des clés aligné sur l’exemple officiel DVPass (JSON → base64url → HMAC sur `header.payload`).
  return {
    iss: config.merchantId,
    pack: aud.packageId,
    sub,
    iat,
  };
}

export function signDvPassJwt(secret: string, payload: Record<string, unknown>): string {
  // Ordre des clés comme snippet officiel DVPass (CryptoJS) : typ puis alg.
  const header = { typ: "JWT", alg: "HS256" };
  const headerPart = b64url(JSON.stringify(header));
  const payloadPart = b64url(JSON.stringify(payload));
  const signingInput = `${headerPart}.${payloadPart}`;
  const sig = createHmac("sha256", resolveDvPassMerchantSecretKey(secret))
    .update(signingInput)
    .digest();
  return `${signingInput}.${b64url(sig)}`;
}
