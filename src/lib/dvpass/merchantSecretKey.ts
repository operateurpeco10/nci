/**
 * Même matériau de clé HMAC que pour le JWT marchand (doc DVPass / CryptoJS).
 * À utiliser pour callback navigateur et event forwarding si DVPASS_SECRET_ENCODING est hex ou auto.
 */
function secretEncodingFromEnv(): "auto" | "raw" | "hex" {
  const raw = process.env.DVPASS_SECRET_ENCODING?.trim().toLowerCase();
  if (raw === "raw" || raw === "hex" || raw === "auto") return raw;
  return "raw";
}

function isHexSecret(secret: string): boolean {
  return secret.length % 2 === 0 && /^[0-9a-f]+$/i.test(secret);
}

export function resolveDvPassMerchantSecretKey(secret: string): string | Buffer {
  const mode = secretEncodingFromEnv();
  if (mode === "raw") return secret;
  if (mode === "hex") return Buffer.from(secret, "hex");
  return isHexSecret(secret) ? Buffer.from(secret, "hex") : secret;
}
