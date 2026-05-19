import { createCipheriv, createHash } from "crypto";

import { resolveDvPassMerchantSecretKey } from "./merchantSecretKey";

/**
 * DV Pass V2.1 §5.3 — Données personnelles dans le JWT Forward (URL) :
 * tout le bloc `user` est chiffré en une chaîne Base64.
 *
 * - Cipher : AES-256-CBC, padding PKCS#7 (défaut Node)
 * - Clé : SHA256(secret marchand) — même matériau que pour JWT/HMAC via resolveDvPassMerchantSecretKey
 * - IV : binaire MD5(correlationId) (16 octets)
 */
export function encryptDvPassForwardUserCollection(
  user: Record<string, unknown>,
  correlationId: string,
  merchantSecret: string
): string {
  const keyMaterial = resolveDvPassMerchantSecretKey(merchantSecret);
  const key = createHash("sha256").update(keyMaterial).digest();
  const iv = createHash("md5").update(correlationId, "utf8").digest();

  const plaintext = JSON.stringify(user);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return encrypted.toString("base64");
}
