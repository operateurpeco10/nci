import { createHmac, timingSafeEqual } from "crypto";

import { resolveDvPassMerchantSecretKey } from "./merchantSecretKey";

/** Variantes avec/sans slash final (DV / reverse proxies). */
export function normalizeDvPassEventForwardingUrlVariants(url: string): string[] {
  const trimmed = url.trim();
  if (!trimmed) return [];
  const out = [trimmed];
  if (trimmed.endsWith("/")) out.push(trimmed.replace(/\/+$/, ""));
  else out.push(`${trimmed}/`);
  return [...new Set(out.filter(Boolean))];
}

/**
 * DV §5.1 : la chaîne signée est `URL + JSON`. Certains stacks signent avec le port explicite
 * (`https://host:443/...`) alors que l’URL configurée omet `:443` (défaut HTTPS).
 */
export function expandDvPassEventSigningUrlBases(urls: string[]): string[] {
  const set = new Set<string>();
  const addChain = (u: string) => {
    for (const v of normalizeDvPassEventForwardingUrlVariants(u)) set.add(v);
  };
  for (const url of urls) {
    addChain(url);
    try {
      const u = new URL(url.trim());
      if (u.protocol === "https:" && !u.port) {
        addChain(`https://${u.hostname}:443${u.pathname}`);
      } else if (u.protocol === "http:" && !u.port) {
        addChain(`http://${u.hostname}:80${u.pathname}`);
      }
    } catch {
      /* ignore */
    }
  }
  return [...set];
}

/** Retire BOM / espaces parasites souvent collés au copier-coller depuis le portail. */
export function normalizeHub2WebhookSecret(secret: string): string {
  return secret.replace(/^\uFEFF/, "").trim();
}

/**
 * Matériaux de clé HMAC pour Hub2 (doc : `createHmac('sha256', secret)` avec `secret` string UTF-8).
 * Certains portails affichent une valeur hex ; Hub2 signe en général avec la chaîne telle quelle,
 * mais on retente avec les octets décodés si la chaîne est hex-only (évite les 401 « signature invalide »).
 */
function hub2WebhookHmacKeyMaterials(secret: string): (string | Buffer)[] {
  const s = normalizeHub2WebhookSecret(secret);
  const out: (string | Buffer)[] = [];
  if (!s) return out;

  const encoding = process.env.DVPASS_NOTIFY_WEBHOOK_SECRET_ENCODING?.trim().toLowerCase();
  if (encoding === "hex") {
    try {
      const buf = Buffer.from(s, "hex");
      if (buf.length > 0) out.push(buf);
    } catch {
      /* ignore */
    }
    if (out.length === 0) out.push(s);
    return out;
  }

  out.push(s);
  if (encoding === "utf8") return out;

  // auto (défaut) : si tout-hex et longueur paire, essayer aussi la clé binaire décodée
  if (s.length >= 16 && s.length % 2 === 0 && /^[0-9a-f]+$/i.test(s)) {
    try {
      const buf = Buffer.from(s, "hex");
      if (buf.length > 0) out.push(buf);
    } catch {
      /* ignore */
    }
  }
  return out;
}

/** Valeurs `s1` / `s0` brutes (doc DV §3.3.3 : digest parfois base64url ; Hub2 : souvent hex). */
function hub2SignatureHeaderToS1S0Values(signatureHeader: string): string[] {
  const raw = signatureHeader.trim();
  const sigParts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of sigParts) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const key = part.slice(0, i).trim().toLowerCase();
    const val = part.slice(i + 1).trim();
    if ((key === "s1" || key === "s0") && val.length > 0) {
      out.push(val);
    }
  }
  return out;
}

function hub2DigestMatchesAnyS1S0Values(
  keyMaterial: string | Buffer,
  signingPayload: string,
  sigValues: string[]
): boolean {
  const expected = createHmac("sha256", keyMaterial).update(signingPayload, "utf8").digest();
  const expectedHexLen = expected.length * 2;

  for (const sigRaw of sigValues) {
    const trimmed = sigRaw.trim();
    if (!trimmed) continue;

    if (/^[0-9a-f]+$/i.test(trimmed) && trimmed.length === expectedHexLen) {
      try {
        const provided = Buffer.from(trimmed, "hex");
        if (provided.length === expected.length && timingSafeEqual(provided, expected)) return true;
      } catch {
        /* ignore invalid hex */
      }
    }

    try {
      const b64url = Buffer.from(trimmed, "base64url");
      if (b64url.length === expected.length && timingSafeEqual(b64url, expected)) return true;
    } catch {
      /* ignore */
    }
    const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.length % 4;
    const padded = pad ? normalized + "=".repeat(4 - pad) : normalized;
    try {
      const b64 = Buffer.from(padded, "base64");
      if (b64.length === expected.length && timingSafeEqual(b64, expected)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

/**
 * DVPass §5.1 — événements : « JSON without any carriage return » ; on essaie quelques normalisations
 * sans changer l’ordre des clés (contrairement à un re-stringify).
 */
export function dvPassNotifyBodyVariantsForSignature(rawBody: string): string[] {
  const ordered: string[] = [];
  const add = (s: string) => {
    if (ordered.includes(s)) return;
    ordered.push(s);
  };
  add(rawBody);
  let b = rawBody;
  if (b.charCodeAt(0) === 0xfeff) {
    b = b.slice(1);
    add(b);
  }
  const normalizedCr = b.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalizedCr !== b) add(normalizedCr);
  return ordered;
}

/**
 * DV Pass V2.1 §5.1 — Event forwarding / callback :
 * HMACSHA256(URL + contenu, secret). Événements : URL de notification + JSON (doc : sans \r superflu).
 * Accepte aussi `Hub2-Signature: s1=…,s0=…` (même digest hex que le callback si DV réutilise le format).
 */
export function verifyDvPassEventSignature(opts: {
  eventForwardingUrl: string | string[];
  rawBody: string;
  signatureHeader: string | null | undefined;
  secret: string;
  /**
   * `dvpass` (défaut) : `resolveDvPassMerchantSecretKey(DVPASS_SECRET)`.
   * `utf8` : secret profil notification portail (même matériau que `DVPASS_NOTIFY_WEBHOOK_SECRET` / Hub2).
   */
  secretKeyMode?: "dvpass" | "utf8";
}): boolean {
  const rawHeader = opts.signatureHeader?.trim();
  if (!rawHeader) return false;

  const baseUrls = expandDvPassEventSigningUrlBases(
    (
      Array.isArray(opts.eventForwardingUrl)
        ? opts.eventForwardingUrl
        : [opts.eventForwardingUrl]
    ).flatMap(normalizeDvPassEventForwardingUrlVariants)
  );
  if (baseUrls.length === 0) return false;

  const candidateSignatures = rawHeader.includes("=")
    ? rawHeader
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const i = part.indexOf("=");
          return i >= 0 ? part.slice(i + 1).trim() : part;
        })
        .filter(Boolean)
    : [rawHeader];

  const decodeCandidates = (sig: string): Buffer[] => {
    const out: Buffer[] = [];
    const trimmed = sig.trim();
    if (!trimmed) return out;

    if (/^[0-9a-f]+$/i.test(trimmed) && trimmed.length % 2 === 0) {
      out.push(Buffer.from(trimmed, "hex"));
    }

    const b64url = Buffer.from(trimmed, "base64url");
    if (b64url.length > 0) out.push(b64url);
    const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.length % 4;
    const padded = pad ? normalized + "=".repeat(4 - pad) : normalized;
    const b64 = Buffer.from(padded, "base64");
    if (b64.length > 0) out.push(b64);

    return out;
  };

  const mode = opts.secretKeyMode ?? "dvpass";
  const keyMaterials: (string | Buffer)[] =
    mode === "utf8"
      ? hub2WebhookHmacKeyMaterials(opts.secret)
      : [resolveDvPassMerchantSecretKey(normalizeHub2WebhookSecret(opts.secret))];
  if (keyMaterials.length === 0) return false;

  const bodyVariants = dvPassNotifyBodyVariantsForSignature(opts.rawBody);

  for (const body of bodyVariants) {
    for (const baseUrl of baseUrls) {
      const signingInput = baseUrl + body;
      for (const keyMaterial of keyMaterials) {
        const expected = createHmac("sha256", keyMaterial).update(signingInput, "utf8").digest();
        for (const sig of candidateSignatures) {
          for (const provided of decodeCandidates(sig)) {
            if (provided.length !== expected.length) continue;
            if (timingSafeEqual(provided, expected)) return true;
          }
        }
      }
    }
  }
  return false;
}

/**
 * Hub2 webhooks : header `Hub2-Signature: s1=hex,s0=hex`.
 * - Doc Hub2 : HMAC-SHA256(secret, corps JSON brut uniquement).
 * - Digital Virgo (DVPass §5.1) : parfois le même header mais HMAC-SHA256(secret, eventForwardingUrl + corps),
 *   avec le secret profil notification ou le secret marchand — on retente avec `dvUrlPlusBodyBases` si fourni.
 * @see https://docs.hub2.io/integration/en/webhooks/webhooks_integration
 */
export function verifyHub2WebhookBodySignature(opts: {
  rawBody: string;
  signatureHeader: string | null | undefined;
  /** Clé telle que fournie par Hub2 (souvent UTF-8 ; si identique à DVPASS_SECRET, passer via resolveDvPass). */
  secret: string;
  /** `utf8` = clé brute (recommandé pour DVPASS_NOTIFY_WEBHOOK_SECRET). `dvpass` = resolveDvPassMerchantSecretKey (JWT / purchase). */
  secretKeyMode?: "utf8" | "dvpass";
  /**
   * Bases d’URL (ex. `DVPASS_EVENT_FORWARDING_URL` + URL dérivée de la requête) pour retenter
   * `HMAC(secret, url + rawBody)` si la vérification « corps seul » échoue.
   */
  dvUrlPlusBodyBases?: string[];
}): boolean {
  const raw = opts.signatureHeader?.trim();
  if (!raw) return false;

  const sigValues = hub2SignatureHeaderToS1S0Values(raw);
  if (sigValues.length === 0) return false;

  const mode = opts.secretKeyMode ?? "utf8";
  const keyMaterials: (string | Buffer)[] =
    mode === "dvpass"
      ? [resolveDvPassMerchantSecretKey(normalizeHub2WebhookSecret(opts.secret))]
      : hub2WebhookHmacKeyMaterials(opts.secret);

  const bases = opts.dvUrlPlusBodyBases?.length
    ? expandDvPassEventSigningUrlBases([
        ...new Set(opts.dvUrlPlusBodyBases.flatMap(normalizeDvPassEventForwardingUrlVariants)),
      ])
    : [];

  const bodyVariants = dvPassNotifyBodyVariantsForSignature(opts.rawBody);

  for (const body of bodyVariants) {
    for (const keyMaterial of keyMaterials) {
      if (hub2DigestMatchesAnyS1S0Values(keyMaterial, body, sigValues)) return true;
    }
  }
  for (const base of bases) {
    for (const body of bodyVariants) {
      const signingPayload = `${base}${body}`;
      for (const keyMaterial of keyMaterials) {
        if (hub2DigestMatchesAnyS1S0Values(keyMaterial, signingPayload, sigValues)) return true;
      }
    }
  }

  return false;
}

/**
 * Construit un en-tête `Hub2-Signature: s1=…` accepté par {@link verifyHub2WebhookBodySignature}
 * pour le même corps (corps seul ou URL + corps selon la config DV / Hub2).
 */
export function buildDvPassNotifyHub2SignatureHeader(opts: {
  rawBody: string;
  dvUrlPlusBodyBases: string[];
  secret: string;
  secretKeyMode: "utf8" | "dvpass";
}): { signatureHeader: string; bodyForRequest: string } | null {
  const bases = opts.dvUrlPlusBodyBases?.length
    ? expandDvPassEventSigningUrlBases([
        ...new Set(opts.dvUrlPlusBodyBases.flatMap(normalizeDvPassEventForwardingUrlVariants)),
      ])
    : [];

  for (const body of dvPassNotifyBodyVariantsForSignature(opts.rawBody)) {
    const keyMaterials: (string | Buffer)[] =
      opts.secretKeyMode === "dvpass"
        ? [resolveDvPassMerchantSecretKey(normalizeHub2WebhookSecret(opts.secret))]
        : hub2WebhookHmacKeyMaterials(opts.secret);

    for (const km of keyMaterials) {
      const candidates: string[] = [
        `s1=${createHmac("sha256", km).update(body, "utf8").digest("hex")}`,
      ];
      for (const base of bases) {
        candidates.push(
          `s1=${createHmac("sha256", km).update(`${base}${body}`, "utf8").digest("hex")}`
        );
      }
      for (const signatureHeader of candidates) {
        if (
          verifyHub2WebhookBodySignature({
            rawBody: body,
            signatureHeader,
            secret: opts.secret,
            secretKeyMode: opts.secretKeyMode,
            dvUrlPlusBodyBases: opts.dvUrlPlusBodyBases,
          })
        ) {
          return { signatureHeader, bodyForRequest: body };
        }
      }
    }
  }
  return null;
}

/**
 * Bases d’URL utilisées pour la signature event forwarding (DV §5.1 : url + corps brut).
 * `DVPASS_EVENT_FORWARDING_URL` peut contenir plusieurs URLs séparées par virgule ou saut de ligne
 * (ex. www + apex) si le portail et Vercel ne sont pas strictement identiques.
 */
export function getDvPassEventForwardingUrlBases(): string[] {
  const raw = process.env.DVPASS_EVENT_FORWARDING_URL?.trim();
  if (!raw) return [];
  const parts = raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    try {
      const u = new URL(part);
      out.push(`${u.origin}${u.pathname}`);
    } catch {
      /* ignore invalid segment */
    }
  }
  return [...new Set(out)];
}

/**
 * Bases dérivées de la requête HTTP (DV §5.1 : HMAC sur `eventForwardingUrl + rawBody`).
 * DV signe en général avec l’URL enregistrée chez eux — souvent le même host/path que ce POST.
 * Ajouter ces candidats évite des 401 quand `DVPASS_EVENT_FORWARDING_URL` ne reflète pas le
 * domaine réel (www vs apex, custom domain vs `*.vercel.app`, etc.).
 */
export function getDvPassEventForwardingUrlBasesFromIncomingRequest(request: Request): string[] {
  const out: string[] = [];
  const baseFromRequestUrl = (): string => {
    const u = new URL(request.url);
    u.search = "";
    u.hash = "";
    return `${u.origin}${u.pathname}`;
  };

  try {
    out.push(baseFromRequestUrl());
  } catch {
    /* ignore */
  }

  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim();
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (host) {
    try {
      const u = new URL(request.url);
      u.search = "";
      u.hash = "";
      out.push(`${proto}://${host}${u.pathname}`);
    } catch {
      /* ignore */
    }
  }

  return [...new Set(out.filter(Boolean))];
}

/** Environnement + URL réellement appelée (dédoublonné). */
export function mergeDvPassEventForwardingBasesWithIncomingRequest(
  envBases: string[],
  request: Request
): string[] {
  return [
    ...new Set([...envBases, ...getDvPassEventForwardingUrlBasesFromIncomingRequest(request)]),
  ];
}

/** Première URL forwarding (rétrocompat / messages d’erreur). */
export function getDvPassEventForwardingUrl(): string | null {
  const bases = getDvPassEventForwardingUrlBases();
  return bases[0] ?? null;
}
