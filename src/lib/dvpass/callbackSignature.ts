import { createHmac, timingSafeEqual } from "crypto";

import { resolveDvPassMerchantSecretKey } from "./merchantSecretKey";

function computeCallbackMac(secret: string, signingInput: string): Buffer {
  return createHmac("sha256", resolveDvPassMerchantSecretKey(secret))
    .update(signingInput, "utf8")
    .digest();
}

/** DVPass : base64url, base64, ou hex (64 car.) pour le digest HMAC-SHA256. */
function decodeSignatureParam(raw: string, expectedLen: number): Buffer | null {
  const t = raw.trim();
  let sigBuf = Buffer.from(t, "base64url");
  if (sigBuf.length !== expectedLen) {
    sigBuf = Buffer.from(t, "base64");
  }
  if (sigBuf.length !== expectedLen && /^[0-9a-f]+$/i.test(t) && t.length % 2 === 0) {
    sigBuf = Buffer.from(t, "hex");
  }
  if (sigBuf.length !== expectedLen) return null;
  return sigBuf;
}

/** Clés documentées V2.1 §3.4.3 (hors `signature`). */
const DV_PASS_CALLBACK_DOC_QUERY_KEYS = new Set([
  "status",
  "code",
  "message",
  "date",
  "correlationId",
  "operationId",
  "iat",
]);

/** Certains callbacks ERROR incluent `detail` dans la chaîne signée ; d’autres non — on essaie les deux filtres. */
const DV_PASS_CALLBACK_DOC_QUERY_KEYS_WITH_DETAIL = new Set([
  ...DV_PASS_CALLBACK_DOC_QUERY_KEYS,
  "detail",
]);

/** Ordre de l’exemple de query §3.4.3 (différent du tri alphabétique status/code/…). */
const DV_PASS_CALLBACK_DOC_TABLE_ORDER = [
  "status",
  "code",
  "message",
  "date",
  "correlationId",
  "operationId",
  "iat",
] as const;

function tryMacAgainstSigningInputs(
  secret: string,
  signatureParam: string,
  signingInputs: string[]
): boolean {
  const sigBuf = decodeSignatureParam(signatureParam, 32);
  if (!sigBuf) return false;
  for (const signingInput of signingInputs) {
    const mac = computeCallbackMac(secret, signingInput);
    if (mac.length === sigBuf.length && timingSafeEqual(mac, sigBuf)) {
      return true;
    }
  }
  return false;
}

function signingInputsForQueryString(
  callbackBaseUrl: string,
  qsRfc3986: string
): string[] {
  if (qsRfc3986.length === 0) return [callbackBaseUrl];
  const out: string[] = [`${callbackBaseUrl}?${qsRfc3986}`];
  const qsPlus = qsRfc3986.replace(/%20/g, "+");
  if (qsPlus !== qsRfc3986) {
    out.push(`${callbackBaseUrl}?${qsPlus}`);
  }
  return out;
}

/**
 * Segments `&` de la query tels qu’à l’URL, sans le paramètre `signature` (ordre conservé).
 * Certaines implémentations DV semblent signer dans l’ordre de redirection, pas tri alphabétique.
 */
function rawQueryStringWithoutSignaturePreservingOrder(search: string): string {
  const s = search.startsWith("?") ? search.slice(1) : search;
  if (!s) return "";
  const kept: string[] = [];
  for (const part of s.split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const rawKey = i === -1 ? part : part.slice(0, i);
    let key: string;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, "%20"));
    } catch {
      key = rawKey;
    }
    if (key.toLowerCase() === "signature") continue;
    kept.push(part);
  }
  return kept.join("&");
}

/** Même ordre que la redirection, mais uniquement les clés du tableau doc (sans `detail`, etc.). */
function rawQueryDocKeysPreservingRedirectOrder(search: string): string {
  const s = search.startsWith("?") ? search.slice(1) : search;
  if (!s) return "";
  const kept: string[] = [];
  for (const part of s.split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const rawKey = i === -1 ? part : part.slice(0, i);
    let key: string;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, "%20"));
    } catch {
      key = rawKey;
    }
    if (key.toLowerCase() === "signature") continue;
    if (!DV_PASS_CALLBACK_DOC_QUERY_KEYS.has(key)) continue;
    kept.push(part);
  }
  return kept.join("&");
}

/** Parse `?a=1&b=c+d` en gardant les valeurs telles que dans l’URL (évite que `+` devienne espace). */
function rawQueryPairs(search: string): { key: string; rawValue: string }[] {
  const s = search.startsWith("?") ? search.slice(1) : search;
  if (!s) return [];
  const out: { key: string; rawValue: string }[] = [];
  for (const segment of s.split("&")) {
    if (!segment) continue;
    const i = segment.indexOf("=");
    const rawKey = i === -1 ? segment : segment.slice(0, i);
    const rawVal = i === -1 ? "" : segment.slice(i + 1);
    let key: string;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, "%20"));
    } catch {
      key = rawKey;
    }
    if (key.toLowerCase() === "signature") continue;
    out.push({ key, rawValue: rawVal });
  }
  return out;
}

function verifyDvPassCallbackSignatureOnce(
  callbackBaseUrl: string,
  searchParams: URLSearchParams,
  secret: string,
  signatureParam: string,
  /** null = toutes les clés sauf signature ; sinon sous-ensemble doc uniquement si présentes. */
  keyFilter: Set<string> | null,
  keySort: "alpha" | "natural" | "doc-table"
): boolean {
  const pairs: { key: string; value: string }[] = [];
  searchParams.forEach((value, key) => {
    if (key.toLowerCase() === "signature") return;
    if (keyFilter !== null && !keyFilter.has(key)) return;
    pairs.push({ key, value });
  });

  let ordered: { key: string; value: string }[];
  if (keySort === "doc-table") {
    ordered = [];
    for (const key of DV_PASS_CALLBACK_DOC_TABLE_ORDER) {
      if (keyFilter !== null && !keyFilter.has(key)) continue;
      const hit = pairs.find((p) => p.key === key);
      if (hit) ordered.push(hit);
    }
  } else {
    const cmp =
      keySort === "natural"
        ? (a: { key: string }, b: { key: string }) =>
            a.key.localeCompare(b.key, "en", {
              numeric: true,
              sensitivity: "base",
            })
        : (a: { key: string }, b: { key: string }) =>
            a.key.localeCompare(b.key, "en", { sensitivity: "base" });
    ordered = [...pairs].sort(cmp);
  }

  const qsRfc3986 = ordered
    .map(
      ({ key, value }) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    )
    .join("&");

  return tryMacAgainstSigningInputs(
    secret,
    signatureParam,
    signingInputsForQueryString(callbackBaseUrl, qsRfc3986)
  );
}

function verifyFromRawSearch(
  callbackBaseUrl: string,
  search: string,
  secret: string,
  signatureParam: string,
  keyFilter: Set<string> | null,
  keySort: "alpha" | "natural" | "doc-table"
): boolean {
  let rawPairs = rawQueryPairs(search);
  rawPairs = rawPairs.filter(
    (p) => keyFilter === null || keyFilter.has(p.key)
  );

  let ordered: { key: string; rawValue: string }[];
  if (keySort === "doc-table") {
    ordered = [];
    for (const key of DV_PASS_CALLBACK_DOC_TABLE_ORDER) {
      if (keyFilter !== null && !keyFilter.has(key)) continue;
      const hit = rawPairs.find((p) => p.key === key);
      if (hit) ordered.push(hit);
    }
  } else {
    const cmp =
      keySort === "natural"
        ? (a: { key: string }, b: { key: string }) =>
            a.key.localeCompare(b.key, "en", {
              numeric: true,
              sensitivity: "base",
            })
        : (a: { key: string }, b: { key: string }) =>
            a.key.localeCompare(b.key, "en", { sensitivity: "base" });
    ordered = [...rawPairs].sort(cmp);
  }

  const qs = ordered
    .map(({ key, rawValue }) => `${encodeURIComponent(key)}=${rawValue}`)
    .join("&");

  return tryMacAgainstSigningInputs(
    secret,
    signatureParam,
    signingInputsForQueryString(callbackBaseUrl, qs)
  );
}

/**
 * DV Pass V2.1 §5.1 — Vérification callback navigateur :
 * paramètres de query triés par clé (ordre naturel), encodés RFC 3986, sans `signature`.
 *
 * Les redirections utilisent souvent `+` pour les espaces dans la query ; la doc cite RFC 3986
 * (%20). On accepte les deux formes de chaîne signée si le HMAC correspond.
 *
 * Plusieurs bases d’URL : DV signe avec le `callback` du JWT (ex. https://www…), qui peut différer
 * de DVPASS_PURCHASE_CALLBACK_URL (apex vs www). On essaie chaque base et, si besoin, seulement les
 * clés documentées (sans `detail`, etc.).
 *
 * Variantes §5.1 : tri alphabétique, tri « naturel » (numeric), ordre de l’exemple doc, et chaîne
 * reconstruite depuis la query brute (préserve `+` dans les valeurs, ce que URLSearchParams n’offre pas).
 */
export function verifyDvPassCallbackSignature(opts: {
  /** URL(s) exacte(s) du callback sans ?query — typiquement [URL requête, puis env]. */
  callbackBaseUrl: string | string[];
  searchParams: URLSearchParams;
  secret: string;
  signatureParam: string | null;
  /** Ex. `new URL(request.url).search` — pour HMAC aligné sur les octets réels de la query. */
  rawSearch?: string;
}): boolean {
  if (!opts.signatureParam?.trim()) return false;

  const basesRaw = Array.isArray(opts.callbackBaseUrl)
    ? opts.callbackBaseUrl
    : [opts.callbackBaseUrl];
  const bases = [...new Set(basesRaw.map((b) => b.trim()).filter(Boolean))];
  if (bases.length === 0) return false;

  const sig = opts.signatureParam.trim();
  /** Doc §5.1 callback : tri par clé en ordre « naturel » + RFC 3986 ; sous-ensemble doc avant « toutes les clés » (Wave peut ajouter des params non signés). */
  const sorts: Array<"natural" | "alpha" | "doc-table"> = [
    "natural",
    "alpha",
    "doc-table",
  ];
  const keyFilters = [
    DV_PASS_CALLBACK_DOC_QUERY_KEYS,
    DV_PASS_CALLBACK_DOC_QUERY_KEYS_WITH_DETAIL,
    null,
  ] as const;

  for (const base of bases) {
    for (const keyFilter of keyFilters) {
      for (const keySort of sorts) {
        if (
          verifyDvPassCallbackSignatureOnce(
            base,
            opts.searchParams,
            opts.secret,
            sig,
            keyFilter,
            keySort
          )
        ) {
          return true;
        }
      }
    }
    if (opts.rawSearch) {
      for (const keyFilter of keyFilters) {
        for (const keySort of sorts) {
          if (
            verifyFromRawSearch(
              base,
              opts.rawSearch,
              opts.secret,
              sig,
              keyFilter,
              keySort
            )
          ) {
            return true;
          }
        }
      }

      const preserved = rawQueryStringWithoutSignaturePreservingOrder(opts.rawSearch);
      if (preserved.length > 0) {
        if (
          tryMacAgainstSigningInputs(
            opts.secret,
            sig,
            signingInputsForQueryString(base, preserved)
          )
        ) {
          return true;
        }
        const preservedPlus = preserved.replace(/%20/g, "+");
        if (preservedPlus !== preserved) {
          if (
            tryMacAgainstSigningInputs(
              opts.secret,
              sig,
              signingInputsForQueryString(base, preservedPlus)
            )
          ) {
            return true;
          }
        }
      }

      const qsDocRedirectOrder = rawQueryDocKeysPreservingRedirectOrder(opts.rawSearch);
      if (qsDocRedirectOrder.length > 0) {
        if (
          tryMacAgainstSigningInputs(
            opts.secret,
            sig,
            signingInputsForQueryString(base, qsDocRedirectOrder)
          )
        ) {
          return true;
        }
        const qsDocPlus = qsDocRedirectOrder.replace(/%20/g, "+");
        if (qsDocPlus !== qsDocRedirectOrder) {
          if (
            tryMacAgainstSigningInputs(
              opts.secret,
              sig,
              signingInputsForQueryString(base, qsDocPlus)
            )
          ) {
            return true;
          }
        }
      }
    }
  }
  return false;
}
