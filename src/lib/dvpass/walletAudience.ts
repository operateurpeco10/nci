import type { DvPassJwtAudience } from "./jwt";

/**
 * wallet_id interne (cf. walletMeta) -> suffixe variables d'env DVPASS_<SUFFIX>_PACKAGE_ID, etc.
 * Quand tu reçois les IDs DVPass par opérateur, remplis uniquement les clés utiles ; le reste hérite de DVPASS_* global.
 */
const WALLET_ENV_SUFFIX: Record<string, string> = {
  orange_ci: "ORANGE_CI",
  mtn_ci: "MTN_CI",
  moov_ci: "MOOV_CI",
  wave_ci: "WAVE_CI",
};

function parseOptionalInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Overrides optionnels lus depuis l'environnement pour un wallet donné. */
export function getDvPassWalletAudienceOverrides(
  walletId: string
): Partial<DvPassJwtAudience> {
  const suffix = WALLET_ENV_SUFFIX[walletId];
  if (!suffix) return {};

  const pick = (key: string) =>
    process.env[`DVPASS_${suffix}_${key}`]?.trim();

  const out: Partial<DvPassJwtAudience> = {};
  const packageId = parseOptionalInt(pick("PACKAGE_ID"));
  if (packageId !== undefined) out.packageId = packageId;
  const serviceId = parseOptionalInt(pick("SERVICE_ID"));
  if (serviceId !== undefined) out.serviceId = serviceId;
  const productId = parseOptionalInt(pick("PRODUCT_ID"));
  if (productId !== undefined) out.productId = productId;
  const offerId = parseOptionalInt(pick("OFFER_ID"));
  if (offerId !== undefined) out.offerId = offerId;
  return out;
}

type DvPassAudienceByVotesMap = Record<number, Partial<DvPassJwtAudience>>;
type DvPassOfferByWalletMap = Record<string, number>;
type DvPassAudienceByVotesEntry = {
  audience: Partial<DvPassJwtAudience>;
  offersByWallet: DvPassOfferByWalletMap;
};
type DvPassAudienceByVotesWithOffersMap = Record<number, DvPassAudienceByVotesEntry>;

const WALLET_ALIASES: Record<string, string> = {
  orange: "orange_ci",
  orange_ci: "orange_ci",
  mtn: "mtn_ci",
  mtn_ci: "mtn_ci",
  moov: "moov_ci",
  moov_ci: "moov_ci",
  wave: "wave_ci",
  wave_ci: "wave_ci",
};

function normalizeWalletId(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return WALLET_ALIASES[key] ?? null;
}

function coerceAudienceValue(raw: unknown): Partial<DvPassJwtAudience> {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;

  const packageId = parseOptionalInt(
    typeof o.packageId === "number" || typeof o.packageId === "string"
      ? String(o.packageId)
      : typeof o.pack === "number" || typeof o.pack === "string"
        ? String(o.pack)
        : undefined
  );
  const serviceId = parseOptionalInt(
    typeof o.serviceId === "number" || typeof o.serviceId === "string"
      ? String(o.serviceId)
      : typeof o.service === "number" || typeof o.service === "string"
        ? String(o.service)
        : undefined
  );
  const productId = parseOptionalInt(
    typeof o.productId === "number" || typeof o.productId === "string"
      ? String(o.productId)
      : typeof o.product === "number" || typeof o.product === "string"
        ? String(o.product)
        : undefined
  );
  const offerId = parseOptionalInt(
    typeof o.offerId === "number" || typeof o.offerId === "string"
      ? String(o.offerId)
      : typeof o.offer === "number" || typeof o.offer === "string"
        ? String(o.offer)
        : undefined
  );

  const out: Partial<DvPassJwtAudience> = {};
  if (packageId !== undefined) out.packageId = packageId;
  if (serviceId !== undefined) out.serviceId = serviceId;
  if (productId !== undefined) out.productId = productId;
  if (offerId !== undefined) out.offerId = offerId;
  return out;
}

function parseAudienceByVotesEnv(
  raw: string | undefined
): DvPassAudienceByVotesMap | null {
  if (!raw?.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const root = parsed as Record<string, unknown>;
  const out: DvPassAudienceByVotesMap = {};

  for (const [k, v] of Object.entries(root)) {
    const voteCount = parseOptionalInt(k);
    if (voteCount === undefined || voteCount < 1) continue;
    const audience = coerceAudienceValue(v);
    if (Object.keys(audience).length > 0) {
      out[voteCount] = audience;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function parseOfferByWalletMap(raw: unknown): DvPassOfferByWalletMap {
  if (!raw || typeof raw !== "object") return {};
  const out: DvPassOfferByWalletMap = {};
  const obj = raw as Record<string, unknown>;
  for (const [walletKey, value] of Object.entries(obj)) {
    const walletId = normalizeWalletId(walletKey);
    if (!walletId) continue;
    const offerId = parseOptionalInt(
      typeof value === "number" || typeof value === "string"
        ? String(value)
        : undefined
    );
    if (offerId !== undefined) out[walletId] = offerId;
  }
  return out;
}

function parseAudienceEntryWithOffers(raw: unknown): DvPassAudienceByVotesEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const audience = coerceAudienceValue(root);

  const nestedOffers =
    root.offers ??
    root.offerByWallet ??
    root.operatorOffers ??
    root.walletOffers;
  let offersByWallet = parseOfferByWalletMap(nestedOffers);

  if (Object.keys(offersByWallet).length === 0) {
    const inlineOffers: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(root)) {
      if (normalizeWalletId(k)) inlineOffers[k] = v;
    }
    offersByWallet = parseOfferByWalletMap(inlineOffers);
  }

  if (
    Object.keys(audience).length === 0 &&
    Object.keys(offersByWallet).length === 0
  ) {
    return null;
  }
  return { audience, offersByWallet };
}

function parseAudienceByVotesWithOffersEnv(
  raw: string | undefined
): DvPassAudienceByVotesWithOffersMap | null {
  if (!raw?.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const root = parsed as Record<string, unknown>;
  const out: DvPassAudienceByVotesWithOffersMap = {};

  for (const [k, v] of Object.entries(root)) {
    const voteCount = parseOptionalInt(k);
    if (voteCount === undefined || voteCount < 1) continue;
    const entry = parseAudienceEntryWithOffers(v);
    if (entry) out[voteCount] = entry;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function getDvPassWalletAudienceByVotes(
  walletId: string
): DvPassAudienceByVotesMap | null {
  const suffix = WALLET_ENV_SUFFIX[walletId];
  if (!suffix) return null;
  const raw = process.env[`DVPASS_${suffix}_AUDIENCE_BY_VOTES`];
  return parseAudienceByVotesEnv(raw);
}

export function getDvPassAudienceByVotesWithOffers():
  | DvPassAudienceByVotesWithOffersMap
  | null {
  return parseAudienceByVotesWithOffersEnv(process.env.DVPASS_AUDIENCE_BY_VOTES);
}

/**
 * Webhooks INVOICE sans `data.provider` ni `user.mccmnc` : retrouver `wallet_id` via `offer.id`
 * (même source que `DVPASS_AUDIENCE_BY_VOTES` / `DVPASS_*_OFFER_ID`).
 */
export function resolveWalletIdFromDvOfferId(offerId: number): string | null {
  if (!Number.isFinite(offerId) || offerId < 1) return null;

  const matrix = getDvPassAudienceByVotesWithOffers();
  if (matrix) {
    const voteKeys = Object.keys(matrix)
      .map((k) => parseInt(k, 10))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    for (const nb of voteKeys) {
      const row = matrix[nb];
      const map = row?.offersByWallet;
      if (!map || typeof map !== "object") continue;
      for (const [walletKey, oid] of Object.entries(map)) {
        const wid = normalizeWalletId(walletKey);
        if (!wid) continue;
        if (oid === offerId) return wid;
      }
    }
  }

  const wallets = ["orange_ci", "mtn_ci", "moov_ci", "wave_ci"] as const;
  for (const w of wallets) {
    const overrides = getDvPassWalletAudienceOverrides(w);
    if (overrides.offerId === offerId) return w;
  }

  return null;
}

export function resolveDvPassWalletAudience(opts: {
  walletId: string;
  nbVotes: number;
}):
  | {
      overrides: Partial<DvPassJwtAudience>;
      source:
        | "votes_pack_operator_offer"
        | "votes_matrix"
        | "wallet_overrides"
        | "global";
      missingVotesMapping: false;
      missingWalletOfferMapping: false;
    }
  | {
      overrides: null;
      source: "votes_matrix";
      missingVotesMapping: true;
      missingWalletOfferMapping: false;
      expectedVotes: number[];
      expectedWallets?: never;
    }
  | {
      overrides: null;
      source: "votes_pack_operator_offer";
      missingVotesMapping: false;
      missingWalletOfferMapping: true;
      expectedVotes?: never;
      expectedWallets: string[];
    } {
  const matrixByVotes = getDvPassAudienceByVotesWithOffers();
  if (matrixByVotes) {
    const row = matrixByVotes[opts.nbVotes];
    if (!row) {
      return {
        overrides: null,
        source: "votes_matrix",
        missingVotesMapping: true,
        missingWalletOfferMapping: false,
        expectedVotes: Object.keys(matrixByVotes)
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => a - b),
      };
    }

    const overrides: Partial<DvPassJwtAudience> = { ...row.audience };
    const hasWalletOfferMap = Object.keys(row.offersByWallet).length > 0;
    if (hasWalletOfferMap) {
      const offerForWallet = row.offersByWallet[opts.walletId];
      if (offerForWallet === undefined) {
        return {
          overrides: null,
          source: "votes_pack_operator_offer",
          missingVotesMapping: false,
          missingWalletOfferMapping: true,
          expectedWallets: Object.keys(row.offersByWallet).sort(),
        };
      }
      overrides.offerId = offerForWallet;
    }

    return {
      overrides,
      source: "votes_pack_operator_offer",
      missingVotesMapping: false,
      missingWalletOfferMapping: false,
    };
  }

  const byVotes = getDvPassWalletAudienceByVotes(opts.walletId);
  if (byVotes) {
    const hit = byVotes[opts.nbVotes];
    if (!hit) {
      return {
        overrides: null,
        source: "votes_matrix",
        missingVotesMapping: true,
        missingWalletOfferMapping: false,
        expectedVotes: Object.keys(byVotes)
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => a - b),
      };
    }
    return {
      overrides: hit,
      source: "votes_matrix",
      missingVotesMapping: false,
      missingWalletOfferMapping: false,
    };
  }

  const wallet = getDvPassWalletAudienceOverrides(opts.walletId);
  if (Object.keys(wallet).length > 0) {
    return {
      overrides: wallet,
      source: "wallet_overrides",
      missingVotesMapping: false,
      missingWalletOfferMapping: false,
    };
  }

  return {
    overrides: {},
    source: "global",
    missingVotesMapping: false,
    missingWalletOfferMapping: false,
  };
}
