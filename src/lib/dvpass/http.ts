/**
 * En-têtes HTTP pour appeler l'API marchand DVPass depuis le serveur.
 * Un 403 HTML `awselb/2.0` vient souvent d’un WAF devant merchants.dvpass.io (IP / empreinte client).
 * UA + Accept + Accept-Language + Sec-Fetch-* rapprochent d’un fetch navigateur ; si ça persiste,
 * demander à DV l’allowlist des IP sortantes (Vercel, etc.).
 */
export function dvPassMerchantFetchHeaders(): Record<string, string> {
  const ua =
    process.env.DVPASS_HTTP_USER_AGENT?.trim() ||
    "DVPassClient/1.0";
  return {
    "User-Agent": ua,
  };
}
