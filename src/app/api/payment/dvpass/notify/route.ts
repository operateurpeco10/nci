import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { applyResponsesForIntent } from "@/lib/payment/applyResponsesForIntent";
import {
  getDvPassConfig,
  getDvPassEventForwardingUrlBases,
  mergeDvPassEventForwardingBasesWithIncomingRequest,
  normalizeMsisdnCi,
  resolveWalletIdFromDvOfferId,
  verifyDvPassEventSignature,
  verifyHub2WebhookBodySignature,
  normalizeHub2WebhookSecret,
} from "@/lib/dvpass";
import {
  collectDvPassDiagnosticStrings,
  dvPassBlocksExplicitlyNotOk,
  dvPassTextSuggestsPaymentFailure,
} from "@/lib/dvpass/paymentFailureSignals";
import {
  deriveFailureCodeFromHub2PaymentData,
  deriveFailureCodeFromNotify,
  formatHub2PaymentFailureLine,
  truncateFailureDetail,
} from "@/lib/payment/paymentFailureMeta";

function pickString(o: unknown, key: string): string | null {
  if (!o || typeof o !== "object") return null;
  const v = (o as Record<string, unknown>)[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function nestedDataBlock(
  payload: Record<string, unknown>
): Record<string, unknown> | null {
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : null;
  if (!data) return null;
  const inner = data.data;
  if (inner && typeof inner === "object") {
    return inner as Record<string, unknown>;
  }
  return null;
}

function pickCorrelationId(payload: Record<string, unknown>): string | null {
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : null;
  const nested = nestedDataBlock(payload);
  return (
    pickString(payload, "correlationId") ??
    pickString(payload, "correlation_id") ??
    pickString(data, "correlationId") ??
    pickString(data, "correlation_id") ??
    pickString(nested, "correlationId") ??
    pickString(nested, "correlation_id")
  );
}

function pickInvoiceIdFromBlock(block: Record<string, unknown> | null): string | null {
  if (!block) return null;
  const inv = block.invoice;
  if (!inv || typeof inv !== "object") return null;
  const invoice = inv as Record<string, unknown>;
  const id =
    (typeof invoice.invoiceId === "string" ? invoice.invoiceId : null) ??
    (typeof invoice.id === "string" ? invoice.id : null);
  return id && id.trim().length > 0 ? id.trim() : null;
}

function pickOperationId(payload: Record<string, unknown>): string | null {
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : null;
  const nested = nestedDataBlock(payload);
  return (
    pickString(payload, "operationId") ??
    pickString(data, "operationId") ??
    pickString(nested, "operationId") ??
    pickInvoiceIdFromBlock(payload) ??
    pickInvoiceIdFromBlock(data) ??
    pickInvoiceIdFromBlock(nested) ??
    pickString(payload, "intentId") ??
    pickString(data, "intentId") ??
    pickString(nested, "intentId") ??
    pickString(payload, "id") ??
    pickString(data, "id") ??
    pickString(nested, "id")
  );
}

function pickHub2IntentIdFromPayloadData(data: Record<string, unknown> | null): string | null {
  const v = data ? pickString(data, "intentId") : null;
  return v && /^pi_/i.test(v) ? v : null;
}

function pickHub2PaymentEntityIdFromPayloadData(data: Record<string, unknown> | null): string | null {
  const v = data ? pickString(data, "id") : null;
  return v && /^pay_/i.test(v) ? v : null;
}

/**
 * Même format que initiate : `${voteCode}:${nbVotes}` dans `data.meta`.
 * Quand ce champ est présent, le fallback « wallet + msisdn + montant » est ambigu
 * (plusieurs intents ouverts) et a déjà rattaché un INVOICE au mauvais couple.
 */
function parseDvPassPurchaseMeta(data: Record<string, unknown> | null): {
  voteCode: string;
  nbVotes: number;
} | null {
  if (!data) return null;
  const metaRaw = data.meta;
  if (typeof metaRaw !== "string" || !metaRaw.includes(":")) return null;
  const meta = metaRaw.trim().slice(0, 100);
  const colon = meta.lastIndexOf(":");
  const voteCode = meta.slice(0, colon).trim();
  const nbVotes = parseInt(meta.slice(colon + 1).trim(), 10);
  if (!voteCode || !Number.isFinite(nbVotes) || nbVotes < 1) return null;
  return { voteCode, nbVotes };
}

/** Webhooks INVOICE : pas de data.provider — le user.mccmnc suffit souvent (CI). */
function walletIdFromCiMccmnc(mccmnc: unknown): string | null {
  if (typeof mccmnc !== "number" || !Number.isFinite(mccmnc)) return null;
  if (mccmnc === 61203) return "orange_ci";
  if (mccmnc === 61205) return "mtn_ci";
  if (mccmnc === 61202) return "moov_ci";
  return null;
}

function pickUserBlock(payload: Record<string, unknown>): Record<string, unknown> | null {
  const u = payload.user;
  if (u && typeof u === "object") return u as Record<string, unknown>;
  return null;
}

function pickNotifyAmountFcfa(
  payload: Record<string, unknown>,
  data: Record<string, unknown> | null
): number | null {
  const fromData = data?.amount;
  if (typeof fromData === "number" && Number.isFinite(fromData)) return fromData;
  const inv = payload.invoice;
  if (inv && typeof inv === "object") {
    const price = (inv as Record<string, unknown>).price;
    if (typeof price === "number" && Number.isFinite(price)) return price;
  }
  return null;
}

function pickScalarAsStatusUpper(block: Record<string, unknown>, key: string): string | null {
  const v = block[key];
  if (typeof v === "string" && v.trim()) return v.trim().toUpperCase();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** Statut métier DV / opérateur (plusieurs clés possibles selon les payloads). */
function pickStatus(payload: Record<string, unknown>): string {
  const nested = nestedDataBlock(payload);
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : null;
  const blocks = [nested, data, payload as Record<string, unknown>].filter(
    (b): b is Record<string, unknown> => Boolean(b && typeof b === "object")
  );
  const keys = ["status", "state", "paymentStatus", "outcome", "result"] as const;
  for (const block of blocks) {
    for (const key of keys) {
      const fromPick = pickString(block, key);
      if (fromPick) return fromPick.trim().toUpperCase();
      const fromScalar = pickScalarAsStatusUpper(block, key);
      if (fromScalar) return fromScalar;
    }
  }
  return "";
}

const NOTIFY_SUCCESS_STATUSES = new Set([
  "SUCCESS",
  "COMPLETED",
  "PAID",
  "SUCCEEDED",
  "SUCCESSFUL",
]);

const NOTIFY_FAILURE_STATUSES = new Set([
  "FAILED",
  "FAILURE",
  "FAIL",
  "DECLINED",
  "REJECTED",
  "REFUSED",
  "ERROR",
  "CANCELLED",
  "CANCELED",
  "NOT_AUTHORIZED",
  "UNAUTHORIZED",
  "INSUFFICIENT_FUNDS",
  "INSUFFICIENT_BALANCE",
  "INSUFFICIENTBALANCE",
  "INSUFFICIENT_CREDIT",
  "LOW_BALANCE",
  "NOT_ENOUGH_BALANCE",
  "DO_NOT_HONOR",
  "EXPIRED",
  "INVALID",
  "DENIED",
  "ABORTED",
  "NOK",
]);

const NOTIFY_NON_TERMINAL_STATUSES = new Set([
  "PENDING",
  "PROCESSING",
  "IN_PROGRESS",
  "INITIATED",
  "WAITING",
  "AUTHORIZED",
  "CREATED",
  "SUBMITTED",
  "REQUIRES_ACTION",
  "REQUIRES_CONFIRMATION",
]);

/** Indices sur le `type` d'événement (séparateurs `.` / `_` / mélange casse). */
function notifyEventTypeSuggestsFailure(eventType: string): boolean {
  const t = eventType.trim().toUpperCase();
  if (!t) return false;
  if (
    /\b(FAILED|FAILURE|DECLINED|REJECTED|CANCELLED|CANCELED|INSUFFICIENT|DENIED|ABORTED|EXPIRED)\b/.test(
      t
    )
  ) {
    return true;
  }
  if (/(PAYMENT|TRANSACTION|PURCHASE)/.test(t) && /\b(ERROR|ERR)\b/.test(t)) return true;
  if (/(PAYMENT|TRANSACTION|PURCHASE)[._-]?(FAILED|FAILURE)/.test(t)) return true;
  return false;
}

function notifyEventTypeSuggestsSuccess(eventType: string): boolean {
  const t = eventType.trim().toUpperCase();
  if (!t || notifyEventTypeSuggestsFailure(eventType)) return false;
  return (
    /\b(SUCCEEDED|COMPLETED)\b/.test(t) ||
    /(PAYMENT|TRANSACTION|PURCHASE)[._-]?(SUCCESS|SUCCEEDED|COMPLETED)/.test(t) ||
    /\bPAID\b/.test(t)
  );
}

/** Hub2 `payment.pending` / `payment.processing` / … */
function notifyEventTypeSuggestsIntermediatePayment(eventType: string): boolean {
  const t = eventType.trim().toUpperCase();
  if (!t.startsWith("PAYMENT.")) return false;
  return /\b(PENDING|PROCESSING|REQUIRES|AUTHORIZED|PARTIAL)\b/.test(t);
}

function classifyNotifyPaymentOutcome(
  eventType: string,
  statusRaw: string,
  bodySuggestsFailure: boolean
): "success" | "failure" | "non_terminal" {
  if (NOTIFY_SUCCESS_STATUSES.has(statusRaw)) return "success";
  if (NOTIFY_FAILURE_STATUSES.has(statusRaw)) return "failure";
  if (bodySuggestsFailure) return "failure";
  if (NOTIFY_NON_TERMINAL_STATUSES.has(statusRaw)) return "non_terminal";
  if (statusRaw === "" && notifyEventTypeSuggestsIntermediatePayment(eventType)) return "non_terminal";
  if (statusRaw === "") {
    if (notifyEventTypeSuggestsFailure(eventType)) return "failure";
    if (notifyEventTypeSuggestsSuccess(eventType)) return "success";
    return "non_terminal";
  }
  if (notifyEventTypeSuggestsSuccess(eventType)) return "success";
  if (notifyEventTypeSuggestsFailure(eventType)) return "failure";
  return "failure";
}

function walletIdFromProvider(provider: string | null): string | null {
  if (!provider) return null;
  const p = provider.trim().toLowerCase();
  if (p === "orange") return "orange_ci";
  if (p === "mtn") return "mtn_ci";
  if (p === "moov") return "moov_ci";
  if (p === "wave") return "wave_ci";
  return null;
}

/** Dangereux : accepter les webhooks sans verifier le HMAC §5.1 — uniquement integration / pre-lancement. */
function isNotifySignatureBypassEnabled(): boolean {
  const raw = process.env.DVPASS_NOTIFY_SKIP_SIGNATURE_VERIFY?.trim().toLowerCase();
  return (
    raw === "1" ||
    raw === "true" ||
    raw === "yes" ||
    raw === "on" ||
    raw === "oui"
  );
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  let pathFromRequest = "";
  try {
    pathFromRequest = new URL(request.url).pathname;
  } catch {
    /* ignore */
  }
  /** Toujours émis (même si JSON invalide / PING) : distinguer « DV n’atteint pas Vercel » vs 401/400 ensuite. */
  console.log("[dvpass/notify] raw_in", {
    bodyChars: rawBody.length,
    path: pathFromRequest,
    hub2Sig: Boolean(
      request.headers.get("Hub2-Signature")?.trim() ||
        request.headers.get("hub2-signature")?.trim()
    ),
    signatureHeader: Boolean(
      request.headers.get("Signature")?.trim() || request.headers.get("signature")?.trim()
    ),
    ua: (request.headers.get("user-agent") ?? "").slice(0, 64),
  });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    console.warn("[dvpass/notify] JSON.parse failed (400 payload invalide)");
    return NextResponse.json({ error: "payload invalide" }, { status: 400 });
  }

  const eventType = pickString(payload, "type")?.toUpperCase() ?? "";
  if (eventType === "PING") {
    return new NextResponse(null, { status: 200 });
  }

  /** Toujours émis avant HMAC : si absent dans Vercel alors aucun POST n’atteint la route (config DVPass / URL). */
  console.log("[dvpass/notify] ingress", {
    type: eventType,
    bodyChars: rawBody.length,
  });

  const dv = getDvPassConfig();
  if (!dv) {
    return NextResponse.json(
      { error: "service de paiement non configure" },
      { status: 503 }
    );
  }

  const signatureBypass = isNotifySignatureBypassEnabled();
  const forwardingBases = mergeDvPassEventForwardingBasesWithIncomingRequest(
    getDvPassEventForwardingUrlBases(),
    request
  );
  const hub2HeaderEarly =
    request.headers.get("Hub2-Signature") ?? request.headers.get("hub2-signature");
  if (!signatureBypass && forwardingBases.length === 0 && !hub2HeaderEarly?.trim()) {
    console.error(
      "[dvpass/notify] Aucune base d'URL pour la signature DV (DVPASS_EVENT_FORWARDING_URL) et pas de Hub2-Signature — impossible de verifier."
    );
    return NextResponse.json(
      { error: "URL de notification non configuree (signature)" },
      { status: 503 }
    );
  }

  let sigOk = false;
  if (signatureBypass) {
    console.warn(
      "[dvpass/notify] DVPASS_NOTIFY_SKIP_SIGNATURE_VERIFY actif — HMAC event NON VERIFIE. Desactiver des que la signature DV est alignee (risque: webhooks falsifies)."
    );
    sigOk = true;
  } else {
    const hub2Header = hub2HeaderEarly;
    const hub2WebhookSecretRaw = process.env.DVPASS_NOTIFY_WEBHOOK_SECRET;
    const hub2WebhookSecret = hub2WebhookSecretRaw
      ? normalizeHub2WebhookSecret(hub2WebhookSecretRaw)
      : "";
    let hub2Ok =
      hub2Header &&
      verifyHub2WebhookBodySignature({
        rawBody,
        signatureHeader: hub2Header,
        secret: hub2WebhookSecret || dv.secret,
        secretKeyMode: hub2WebhookSecret ? "utf8" : "dvpass",
        dvUrlPlusBodyBases: forwardingBases,
      });
    // DV peut signer Hub2-Signature avec DVPASS_SECRET (JWT / §5.1 url+corps) alors que le portail affiche un autre secret.
    if (!hub2Ok && hub2Header && hub2WebhookSecret) {
      hub2Ok = verifyHub2WebhookBodySignature({
        rawBody,
        signatureHeader: hub2Header,
        secret: dv.secret,
        secretKeyMode: "dvpass",
        dvUrlPlusBodyBases: forwardingBases,
      });
    }
    // §5.1 officiel : HMACSHA256(URL + JSON, secret) — même entête Hub2-Signature, décodage identique au callback.
    if (!hub2Ok && hub2Header && hub2WebhookSecret) {
      hub2Ok = verifyDvPassEventSignature({
        eventForwardingUrl: forwardingBases,
        rawBody,
        signatureHeader: hub2Header,
        secret: hub2WebhookSecret,
        secretKeyMode: "utf8",
      });
    }
    if (!hub2Ok && hub2Header) {
      hub2Ok = verifyDvPassEventSignature({
        eventForwardingUrl: forwardingBases,
        rawBody,
        signatureHeader: hub2Header,
        secret: dv.secret,
        secretKeyMode: "dvpass",
      });
    }

    const legacyHeader =
      request.headers.get("Signature") ??
      request.headers.get("signature") ??
      request.headers.get("X-Hub-Signature-256") ??
      request.headers.get("x-hub-signature-256") ??
      request.headers.get("X-Hub-Signature") ??
      request.headers.get("x-hub-signature") ??
      request.headers.get("X-DVPass-Signature") ??
      request.headers.get("x-dvpass-signature");
    const legacyOk =
      legacyHeader &&
      verifyDvPassEventSignature({
        eventForwardingUrl: forwardingBases,
        rawBody,
        signatureHeader: legacyHeader,
        secret: dv.secret,
      });

    sigOk = Boolean(hub2Ok || legacyOk);
    if (!sigOk) {
      console.warn(
        "[dvpass/notify] signature HMAC refusee (401). Verifier DVPASS_EVENT_FORWARDING_URL (URL enregistree chez DVPass pour les events) et le secret / encodage.",
        {
          forwardingBaseCount: forwardingBases.length,
          hub2Sig: Boolean(hub2Header?.trim()),
          legacySig: Boolean(legacyHeader?.trim()),
          bodyChars: rawBody.length,
          notifyWebhookSecretEnv: Boolean(process.env.DVPASS_NOTIFY_WEBHOOK_SECRET?.trim()),
        }
      );
      const dbg = process.env.DVPASS_NOTIFY_SIGNATURE_DEBUG?.trim().toLowerCase();
      if (dbg === "1" || dbg === "true" || dbg === "yes" || dbg === "on") {
        const fromEnv = getDvPassEventForwardingUrlBases();
        console.warn("[dvpass/notify] signature mismatch (debug)", {
          forwardingBaseCount: forwardingBases.length,
          forwardingPreview: forwardingBases.map((u) => u.slice(0, 96)),
          envOnlyBaseCount: fromEnv.length,
          rawBodyLength: rawBody.length,
          hub2SignaturePresent: Boolean(hub2Header?.trim()),
          legacySignaturePresent: Boolean(legacyHeader?.trim()),
          hub2WebhookSecretEnv: Boolean(process.env.DVPASS_NOTIFY_WEBHOOK_SECRET?.trim()),
          secretEncoding: process.env.DVPASS_SECRET_ENCODING?.trim() || "raw",
        });
      }
      return NextResponse.json({ error: "signature invalide" }, { status: 401 });
    }
  }

  try {
    let correlationId = pickCorrelationId(payload);
    const data =
      payload.data && typeof payload.data === "object"
        ? (payload.data as Record<string, unknown>)
        : null;
    const operationId = pickOperationId(payload);
    const invoiceIdTop = pickInvoiceIdFromBlock(payload);
    const lookupCandidates = [
      operationId,
      invoiceIdTop,
      pickString(data, "intentId"),
      pickString(data, "id"),
    ].filter((v): v is string => typeof v === "string" && v.length > 0);
    const uniqueLookup = [...new Set(lookupCandidates)];
    const providerReference = operationId ?? uniqueLookup[0] ?? null;
    const provider = pickString(data, "provider");
    const userBlock = pickUserBlock(payload);
    const offerRoot =
      (payload.offer && typeof payload.offer === "object"
        ? payload.offer
        : data?.offer && typeof data.offer === "object"
          ? data.offer
          : null) as Record<string, unknown> | null;
    const offerIdRaw = offerRoot ? offerRoot.id : undefined;
    const offerIdNum =
      typeof offerIdRaw === "number" && Number.isFinite(offerIdRaw)
        ? offerIdRaw
        : typeof offerIdRaw === "string" && /^\d+$/.test(offerIdRaw.trim())
          ? parseInt(offerIdRaw.trim(), 10)
          : NaN;
    const walletFromOffer =
      Number.isFinite(offerIdNum) && offerIdNum > 0
        ? resolveWalletIdFromDvOfferId(offerIdNum)
        : null;
    const walletId =
      walletIdFromProvider(provider) ??
      walletIdFromCiMccmnc(userBlock?.mccmnc) ??
      walletFromOffer;
    const rawNumber =
      pickString(data, "number") ??
      (userBlock ? pickString(userBlock, "msisdn") : null) ??
      (userBlock ? pickString(userBlock, "number") : null);
    const normalizedMsisdn = rawNumber ? normalizeMsisdnCi(rawNumber) : null;
    const amount = pickNotifyAmountFcfa(payload, data);
    const statusRaw = pickStatus(payload);
    const nested = nestedDataBlock(payload);
    const statutDetailRoot =
      payload.statutDetail && typeof payload.statutDetail === "object"
        ? (payload.statutDetail as Record<string, unknown>)
        : null;
    const statutDetailData =
      data?.statutDetail && typeof data.statutDetail === "object"
        ? (data.statutDetail as Record<string, unknown>)
        : null;
    const hub2FailureLine = data ? formatHub2PaymentFailureLine(data) : "";
    const diagnosticText = [
      collectDvPassDiagnosticStrings(
        payload,
        data,
        nested,
        statutDetailRoot,
        statutDetailData
      ),
      hub2FailureLine,
    ]
      .filter(Boolean)
      .join("\n");
    const bodySuggestsFailure =
      dvPassTextSuggestsPaymentFailure(diagnosticText) ||
      dvPassBlocksExplicitlyNotOk(payload, data, nested, statutDetailRoot, statutDetailData);
    const outcome = classifyNotifyPaymentOutcome(eventType, statusRaw, bodySuggestsFailure);

    console.log("[dvpass/notify] webhook received:", {
      type: eventType,
      correlationId,
      operationId,
      status: statusRaw,
      bodySuggestsFailure,
      outcome,
      hub2Style: Boolean(eventType.startsWith("PAYMENT.")),
      rawPayload: payload,
    });

    const supabase = getSupabaseAdmin();

    // Si pas de correlationId, chercher via operationId en DB
    if (!correlationId && uniqueLookup.length > 0) {
      const { data: intentRows, error: intentLookupErr } = await supabase
        .from("payment_intents")
        .select("correlation_id")
        .in("provider_operation_id", uniqueLookup)
        .order("created_at", { ascending: false })
        .limit(1);
      if (intentLookupErr) {
        console.warn("[dvpass/notify] provider_operation_id lookup:", intentLookupErr.message);
      }
      correlationId = intentRows?.[0]?.correlation_id ?? null;
      console.log("[dvpass/notify] resolved correlationId via provider reference:", {
        correlationId,
        lookupCandidates: uniqueLookup,
      });
    }

    // Hub2 : validate stocke souvent operationId (UUID) alors que le webhook envoie intentId (pi_) / id (pay_).
    if (!correlationId && data) {
      const hubIntent = pickHub2IntentIdFromPayloadData(data);
      const hubPay = pickHub2PaymentEntityIdFromPayloadData(data);
      if (hubIntent) {
        const { data: intentByHubPiRows, error: hubPiErr } = await supabase
          .from("payment_intents")
          .select("correlation_id")
          .eq("hub2_intent_id", hubIntent)
          .order("created_at", { ascending: false })
          .limit(1);
        if (hubPiErr) {
          console.warn("[dvpass/notify] hub2_intent_id lookup:", hubPiErr.message);
        }
        correlationId = intentByHubPiRows?.[0]?.correlation_id ?? null;
        if (correlationId) {
          console.log("[dvpass/notify] resolved correlationId via hub2_intent_id:", {
            correlationId,
            hubIntent,
          });
        }
      }
      if (!correlationId && hubPay) {
        const { data: intentByHubPayRows, error: hubPayErr } = await supabase
          .from("payment_intents")
          .select("correlation_id")
          .eq("hub2_payment_id", hubPay)
          .order("created_at", { ascending: false })
          .limit(1);
        if (hubPayErr) {
          console.warn("[dvpass/notify] hub2_payment_id lookup:", hubPayErr.message);
        }
        correlationId = intentByHubPayRows?.[0]?.correlation_id ?? null;
        if (correlationId) {
          console.log("[dvpass/notify] resolved correlationId via hub2_payment_id:", {
            correlationId,
            hubPay,
          });
        }
      }
    }

    // Résolution via data.meta (voteCode:nbVotes) — avant le fallback contextuel, et inclure
    // les intents déjà completed pour les webhooks INVOICE après ONE-SHOT (même paiement).
    const purchaseMeta = parseDvPassPurchaseMeta(data);
    if (!correlationId && purchaseMeta && walletId && normalizedMsisdn) {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: intentMetaRows, error: metaErr } = await supabase
        .from("payment_intents")
        .select("correlation_id")
        .eq("choice_id", purchaseMeta.voteCode)
        .eq("nb_votes", purchaseMeta.nbVotes)
        .eq("wallet_id", walletId)
        .eq("msisdn", normalizedMsisdn)
        .in("status", ["pending", "processing", "completed"])
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1);
      if (metaErr) {
        console.warn("[dvpass/notify] data.meta fallback lookup:", metaErr.message);
      }
      correlationId = intentMetaRows?.[0]?.correlation_id ?? null;
      if (correlationId) {
        console.warn("[dvpass/notify] resolved correlationId via data.meta fallback:", {
          correlationId,
          voteCode: purchaseMeta.voteCode,
          nbVotes: purchaseMeta.nbVotes,
        });
      }
    }

    // Fallback contextuel : uniquement si DVPass n'a pas fourni data.meta (sinon risque de mauvais couple).
    if (!correlationId && !purchaseMeta && walletId && normalizedMsisdn && amount !== null) {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: intentCtxRows, error: ctxErr } = await supabase
        .from("payment_intents")
        .select("correlation_id")
        .eq("wallet_id", walletId)
        .eq("msisdn", normalizedMsisdn)
        .eq("amount_fcfa", amount)
        .in("status", ["pending", "processing"])
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1);
      if (ctxErr) {
        console.warn("[dvpass/notify] contextual fallback lookup:", ctxErr.message);
      }
      correlationId = intentCtxRows?.[0]?.correlation_id ?? null;
      if (correlationId) {
        console.warn("[dvpass/notify] resolved correlationId via contextual fallback:", {
          correlationId,
          walletId,
          normalizedMsisdn,
          amount,
        });
      }
    }

    if (!correlationId) {
      console.error("[dvpass/notify] correlationId introuvable (400) — le webhook est arrive mais ne lie pas a un intent", {
        eventType,
        operationId,
        lookupCandidates: uniqueLookup.slice(0, 8),
        walletId,
        hasDataBlock: Boolean(data),
      });
      return NextResponse.json({ error: "correlationId manquant" }, { status: 400 });
    }

    console.log("[dvpass/notify] correlation resolved", {
      correlationId,
      walletId,
      operationId,
    });

    if (data) {
      const hubIntentPersist = pickHub2IntentIdFromPayloadData(data);
      const hubPayPersist = pickHub2PaymentEntityIdFromPayloadData(data);
      if (hubIntentPersist || hubPayPersist) {
        await supabase
          .from("payment_intents")
          .update({
            ...(hubIntentPersist ? { hub2_intent_id: hubIntentPersist } : {}),
            ...(hubPayPersist ? { hub2_payment_id: hubPayPersist } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("correlation_id", correlationId);
      }
    }

    if (outcome === "non_terminal") {
      console.log("[dvpass/notify] evenement intermediaire, intent inchange:", {
        correlationId,
        statusRaw,
        eventType,
      });
      return new NextResponse(null, { status: 200 });
    }

    if (outcome === "failure") {
      const hub2Code = data ? deriveFailureCodeFromHub2PaymentData(data) : null;
      const failureCode =
        hub2Code ??
        deriveFailureCodeFromNotify(statusRaw, diagnosticText, bodySuggestsFailure);
      const failureDetail = truncateFailureDetail(
        hub2FailureLine ||
          [statusRaw, diagnosticText].filter(Boolean).join(" — ")
      );
      console.log("[dvpass/notify] marking payment as failed:", {
        correlationId,
        failureCode,
      });
      await supabase
        .from("payment_intents")
        .update({
          status: "failed",
          provider_operation_id: providerReference,
          failure_code: failureCode,
          failure_detail: failureDetail || null,
          updated_at: new Date().toISOString(),
        })
        .eq("correlation_id", correlationId);
      return new NextResponse(null, { status: 200 });
    }

    console.log("[dvpass/notify] applying votes for:", correlationId);
    await applyResponsesForIntent(correlationId, supabase, providerReference);
  } catch (e) {
    console.error("[dvpass/notify] traitement:", e);
    return NextResponse.json({ error: "traitement impossible" }, { status: 500 });
  }
  return new NextResponse(null, { status: 200 });
}
