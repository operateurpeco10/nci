import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { applyResponsesForIntent } from "@/lib/payment/applyResponsesForIntent";
import {
  buildDvPassForwardUrl,
  buildDvPassJwtPayload,
  dvPassPurchaseSendOptIn,
  dvPassPurchaseValidate,
  extractDvPassErrorMessage,
  getDvPassConfig,
  getDvPassPurchaseCallbackUrl,
  getWalletDvPassMeta,
  mergeJwtAudience,
  normalizeMsisdnCi,
  resolveDvPassWalletAudience,
  signDvPassJwt,
  buildDvPassPurchaseData,
  getDvPassPurchaseCustomization,
} from "@/lib/dvpass";
import { getPriceFcfaForVotes } from "@/lib/votePricing";
import { isPaymentBypassForWallet } from "@/lib/paymentBypass";
import { getActiveCampaign, resolveChoiceForActiveCampaign } from "@/lib/campaigns";
import { areVotesClosed } from "@/lib/votesClosed";
import {
  collectDvPassDiagnosticStrings,
  dvPassBlocksExplicitlyNotOk,
  dvPassTextSuggestsPaymentFailure,
} from "@/lib/dvpass/paymentFailureSignals";
import {
  deriveFailureCodeFromInitiateBody,
  truncateFailureDetail,
  userFacingPaymentFailureMessage,
} from "@/lib/payment/paymentFailureMeta";

interface PaymentRequest {
  voteCode?: string;
  choiceId?: string;
  nbVotes: number;
  telephoneVotant: string;
  emailVotant?: string;
  paiementVia: string;
  otpCode?: string;
}

function resolveChoiceId(body: PaymentRequest): string | null {
  const id = (body.choiceId ?? body.voteCode)?.trim();
  return id && id.length > 0 ? id : null;
}

function sanitizeForLog(body: PaymentRequest) {
  return {
    choiceId: resolveChoiceId(body),
    nbVotes: body.nbVotes,
    paiementVia: body.paiementVia,
    hasPhone: Boolean(body.telephoneVotant?.trim()),
    hasOtp: Boolean(body.otpCode?.trim()),
  };
}

function pickInvoiceOperationId(block: Record<string, unknown> | null): string | null {
  if (!block) return null;
  const inv = block.invoice;
  if (!inv || typeof inv !== "object") return null;
  const invoice = inv as Record<string, unknown>;
  const id =
    (typeof invoice.invoiceId === "string" ? invoice.invoiceId : null) ??
    (typeof invoice.id === "string" ? invoice.id : null);
  return typeof id === "string" && id.trim().length > 0 ? id.trim() : null;
}

function pickOperationId(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : null;
  const nestedData =
    data?.data && typeof data.data === "object" ? (data.data as Record<string, unknown>) : null;
  const id =
    (typeof root.operationId === "string" ? root.operationId : null) ??
    (typeof data?.operationId === "string" ? data.operationId : null) ??
    (typeof nestedData?.operationId === "string" ? nestedData.operationId : null) ??
    pickInvoiceOperationId(root) ??
    pickInvoiceOperationId(data) ??
    pickInvoiceOperationId(nestedData) ??
    (typeof root.intentId === "string" ? root.intentId : null) ??
    (typeof data?.intentId === "string" ? data.intentId : null) ??
    (typeof nestedData?.intentId === "string" ? nestedData.intentId : null) ??
    (typeof root.id === "string" ? root.id : null) ??
    (typeof data?.id === "string" ? data.id : null) ??
    (typeof nestedData?.id === "string" ? nestedData.id : null);
  return typeof id === "string" && id.trim().length > 0 ? id.trim() : null;
}

function pickHub2IntentIdFromDvJson(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : null;
  const nested =
    data?.data && typeof data.data === "object" ? (data.data as Record<string, unknown>) : null;
  for (const block of [nested, data, root]) {
    if (!block) continue;
    const v = block.intentId;
    if (typeof v === "string" && /^pi_/i.test(v.trim())) return v.trim();
  }
  return null;
}

function pickHub2PaymentEntityIdFromDvJson(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : null;
  const nested =
    data?.data && typeof data.data === "object" ? (data.data as Record<string, unknown>) : null;
  for (const block of [nested, data, root]) {
    if (!block) continue;
    const v = block.id;
    if (typeof v === "string" && /^pay_/i.test(v.trim())) return v.trim();
  }
  return null;
}

function pickRedirectUrl(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  const directKeys = ["redirectUrl", "paymentUrl", "payment_url", "url"];
  for (const key of directKeys) {
    const value = root[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  const nextAction = root.nextAction;
  if (nextAction && typeof nextAction === "object") {
    const next = nextAction as Record<string, unknown>;
    const nextData = next.data;
    if (nextData && typeof nextData === "object") {
      const data = nextData as Record<string, unknown>;
      if (typeof data.url === "string" && data.url.trim()) return data.url.trim();
    }
  }

  const statutDetail = root.statutDetail;
  if (statutDetail && typeof statutDetail === "object") {
    const detail = statutDetail as Record<string, unknown>;
    for (const key of directKeys) {
      const value = detail[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    const nestedAction = detail.nextAction;
    if (nestedAction && typeof nestedAction === "object") {
      const nested = nestedAction as Record<string, unknown>;
      const nestedData = nested.data;
      if (nestedData && typeof nestedData === "object") {
        const data = nestedData as Record<string, unknown>;
        if (typeof data.url === "string" && data.url.trim()) return data.url.trim();
      }
    }
  }

  return null;
}

function getValidateIntentStatus(
  ok: boolean,
  json: unknown,
  redirectUrl: string | null
): "completed" | "processing" | "failed" {
  if (!ok) return "failed";
  if (redirectUrl) return "processing";
  if (!json || typeof json !== "object") return "completed";

  const root = json as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : null;
  const nestedData =
    data?.data && typeof data.data === "object" ? (data.data as Record<string, unknown>) : null;
  const statutDetail =
    root.statutDetail && typeof root.statutDetail === "object"
      ? (root.statutDetail as Record<string, unknown>)
      : null;
  const rootCode = typeof root.code === "number" ? root.code : null;
  const dataCode = typeof data?.code === "number" ? data.code : null;

  if ((rootCode !== null && rootCode !== 0) || (dataCode !== null && dataCode !== 0)) {
    return "failed";
  }

  // DVPass renvoie parfois status dans data.status, parfois dans data.data.status.
  const rawStatus =
    (nestedData && typeof nestedData.status === "string" ? nestedData.status : null) ??
    (data && typeof data.status === "string" ? data.status : null) ??
    root.status ??
    root.paymentStatus ??
    root.payment_status ??
    root.statut ??
    root.result;
  const status =
    typeof rawStatus === "string" ? rawStatus.trim().toUpperCase() : "";

  const mergedMsg = collectDvPassDiagnosticStrings(root, data, nestedData, statutDetail);
  if (dvPassTextSuggestsPaymentFailure(mergedMsg)) return "failed";
  if (dvPassBlocksExplicitlyNotOk(root, data, nestedData, statutDetail)) return "failed";

  const pendingStatuses = new Set([
    "PENDING",
    "PROCESSING",
    "ACTION_REQUIRED",
    "INITIATED",
    "IN_PROGRESS",
    "WAITING",
  ]);
  const failedStatuses = new Set([
    "FAILED",
    "FAILURE",
    "ERROR",
    "REJECTED",
    "REFUSED",
    "CANCELLED",
    "CANCELED",
    "DECLINED",
    "AUTHENTICATION_FAILED",
    "INSUFFICIENT_FUNDS",
    "INSUFFICIENT_BALANCE",
    "INSUFFICIENT_CREDIT",
    "NOT_ENOUGH_BALANCE",
    "LOW_BALANCE",
    "NOK",
  ]);
  const successStatuses = new Set(["SUCCESS", "SUCCEEDED", "COMPLETED", "PAID"]);

  if (pendingStatuses.has(status)) return "processing";
  if (failedStatuses.has(status)) return "failed";
  if (successStatuses.has(status)) return "completed";

  const codesOk =
    (rootCode === null || rootCode === 0) && (dataCode === null || dataCode === 0);
  if (codesOk && !mergedMsg && status === "") return "completed";
  return "processing";
}

function clientIp(request: Request): string | undefined {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim();
  return undefined;
}

function isDvPassDebugEnabled(): boolean {
  const raw = process.env.DVPASS_DEBUG?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function previewToken(token: string): { prefix: string; suffix: string; len: number } {
  const t = token.trim();
  return {
    prefix: t.slice(0, 24),
    suffix: t.length > 32 ? t.slice(-12) : "",
    len: t.length,
  };
}

function decodeJwtPart(part: string): unknown | null {
  try {
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.length % 4;
    const padded = pad ? normalized + "=".repeat(4 - pad) : normalized;
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

function decodeJwtForDebug(token: string): {
  header: unknown;
  payload: unknown;
  preview: ReturnType<typeof previewToken>;
} {
  const parts = token.split(".");
  const header = parts[0] ? decodeJwtPart(parts[0]) : null;
  const payload = parts[1] ? decodeJwtPart(parts[1]) : null;
  return { header, payload, preview: previewToken(token) };
}

export async function POST(request: Request) {
  try {
    const data: PaymentRequest = await request.json();

    const activeCampaign = await getActiveCampaign();
    if (!activeCampaign) {
      return NextResponse.json(
        { success: false, error: "Aucune campagne de vote active." },
        { status: 503 }
      );
    }

    if (await areVotesClosed()) {
      return NextResponse.json(
        {
          success: false,
          error: "La période de vote est terminée.",
        },
        { status: 403 }
      );
    }

    const rawChoiceId = resolveChoiceId(data);
    if (!rawChoiceId) {
      return NextResponse.json(
        { success: false, error: "Choix de réponse manquant" },
        { status: 400 }
      );
    }

    const resolved = await resolveChoiceForActiveCampaign(rawChoiceId);
    if (!resolved) {
      return NextResponse.json(
        { success: false, error: "Choix de réponse invalide pour la campagne en cours" },
        { status: 400 }
      );
    }

    const choiceId = resolved.choice.id as string;
    const campaignId = resolved.campaign.id;
    if (!data.nbVotes || data.nbVotes < 1) {
      return NextResponse.json(
        { success: false, error: "Nombre de votes invalide" },
        { status: 400 }
      );
    }
    if (!data.paiementVia?.trim()) {
      return NextResponse.json(
        { success: false, error: "Moyen de paiement manquant" },
        { status: 400 }
      );
    }

    const amountFcfa = getPriceFcfaForVotes(data.nbVotes);
    if (amountFcfa === null) {
      return NextResponse.json(
        { success: false, error: "Nombre de votes non pris en charge" },
        { status: 400 }
      );
    }

    const correlationId = randomUUID();
    const msisdn = data.telephoneVotant?.trim()
      ? normalizeMsisdnCi(data.telephoneVotant)
      : null;

    if (!msisdn) {
      return NextResponse.json(
        { success: false, error: "Numéro de téléphone requis" },
        { status: 400 }
      );
    }

    const dv = getDvPassConfig();
    if (dv) {
      const walletMeta = getWalletDvPassMeta(data.paiementVia);
      if (!walletMeta) {
        return NextResponse.json(
          {
            success: false,
            error: "Moyen de paiement non pris en charge pour le wallet DVPass",
          },
          { status: 400 }
        );
      }
      if (walletMeta.flow === "validate" && !data.otpCode?.trim()) {
        return NextResponse.json(
          {
            success: false,
            error: "Code PIN / OTP requis pour Orange Money.",
          },
          { status: 400 }
        );
      }
      if (
        walletMeta.flow === "forward" &&
        !getDvPassPurchaseCallbackUrl() &&
        !isPaymentBypassForWallet(data.paiementVia)
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Configuration Wave : definissez DVPASS_PURCHASE_CALLBACK_URL (URL HTTPS publique du callback).",
          },
          { status: 503 }
        );
      }
    }

    const supabase = getSupabaseAdmin();

    const { error: insertError } = await supabase.from("payment_intents").insert({
      correlation_id: correlationId,
      campaign_id: campaignId,
      choice_id: choiceId,
      nb_votes: data.nbVotes,
      wallet_id: data.paiementVia,
      msisdn,
      status: "pending",
      amount_fcfa: amountFcfa,
      raw_request: sanitizeForLog(data),
    });

    if (insertError) {
      console.error("Supabase payment_intents insert:", insertError);
      const missingTable =
        insertError.code === "42P01" ||
        insertError.message?.toLowerCase().includes("does not exist");
      return NextResponse.json(
        {
          success: false,
          error: missingTable
            ? "Service temporairement indisponible."
            : "Impossible d'enregistrer le paiement",
        },
        { status: 500 }
      );
    }

    if (isPaymentBypassForWallet(data.paiementVia)) {
      await applyResponsesForIntent(correlationId, supabase, "bypass");
      await supabase
        .from("payment_intents")
        .update({
          raw_request: { ...sanitizeForLog(data), bypass: true },
        })
        .eq("correlation_id", correlationId);
      console.warn("[payment/initiate] bypass actif — aucun appel DVPass", {
        wallet: data.paiementVia,
        correlationId,
      });
      return NextResponse.json({
        success: true,
        paymentId: correlationId,
        status: "completed",
        bypass: true,
        message: "Paiement simulé (mode test, sans débit).",
      });
    }

    if (dv) {
      const meta = getWalletDvPassMeta(data.paiementVia)!;
      const audienceResolution = resolveDvPassWalletAudience({
        walletId: data.paiementVia,
        nbVotes: data.nbVotes,
      });
      if (audienceResolution.missingVotesMapping) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Configuration paiement incomplète pour ce palier de votes avec cet opérateur.",
            expectedVotes: audienceResolution.expectedVotes,
          },
          { status: 400 }
        );
      }
      if (audienceResolution.missingWalletOfferMapping) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Configuration paiement incomplète : offre opérateur absente pour ce palier de votes.",
            expectedWallets: audienceResolution.expectedWallets,
          },
          { status: 400 }
        );
      }
      const audienceOverrides = audienceResolution.overrides;
      const jwtAudience = mergeJwtAudience(dv, audienceOverrides);
      const jwtPayload = buildDvPassJwtPayload(dv, audienceOverrides);
      const token = signDvPassJwt(dv.secret, jwtPayload);
      const jwtDebug = isDvPassDebugEnabled()
        ? {
            merchantId: dv.merchantId,
            apiBaseUrl: dv.baseUrl,
            secretEncoding: process.env.DVPASS_SECRET_ENCODING?.trim() || "raw",
            jwtDecoded: decodeJwtForDebug(token),
            jwtClaims: jwtPayload,
          }
        : null;

      const metaShort = `${choiceId}:${data.nbVotes}`.slice(0, 100);
      const purchaseData = buildDvPassPurchaseData(metaShort);
      const purchaseCustomization = getDvPassPurchaseCustomization();
      const userBase = {
        msisdn: msisdn,
        userAgent: request.headers.get("user-agent") ?? undefined,
        ip: clientIp(request),
        locale: request.headers.get("accept-language")?.split(",")[0]?.trim(),
        referer: request.headers.get("referer") ?? undefined,
      };
      if (meta.flow !== "forward" && meta.mccmnc === undefined) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Configuration DVPass incomplète : mccmnc manquant pour ce moyen de paiement.",
          },
          { status: 500 }
        );
      }
      const userForForward =
        meta.mccmnc !== undefined ? { ...userBase, mccmnc: meta.mccmnc } : userBase;

      let result: {
        ok: boolean;
        status: number;
        json: unknown;
        text: string | null;
        responseHeaders: Record<string, string>;
      };
      let redirectUrl: string | null = null;
      let dvpassLog: Record<string, unknown>;

      if (meta.flow === "forward") {
        const callbackUrl = getDvPassPurchaseCallbackUrl()!;
        redirectUrl = buildDvPassForwardUrl(
          dv,
          dv.secret,
          {
            correlationId,
            user: userForForward,
            data: purchaseData,
            ...(purchaseCustomization ? { customization: purchaseCustomization } : {}),
            paymentMethod: meta.paymentMethod,
            invoice: { amount: amountFcfa },
            callback: callbackUrl,
          },
          audienceOverrides
        );
        result = { ok: true, status: 200, json: null, text: null, responseHeaders: {} };
        dvpassLog = {
          flow: "forward",
          audienceSource: audienceResolution.source,
          jwtAudience,
          ...(jwtDebug ? { jwtDebug } : {}),
        };
      } else if (meta.flow === "sendoptin") {
        const sendBody = {
          correlationId,
          user: { ...userBase, mccmnc: meta.mccmnc! },
          data: purchaseData,
          ...(purchaseCustomization ? { customization: purchaseCustomization } : {}),
          paymentMethod: meta.paymentMethod,
          invoice: { amount: amountFcfa },
        };
        result = await dvPassPurchaseSendOptIn(dv, token, sendBody);
        dvpassLog = {
          flow: "sendoptin",
          audienceSource: audienceResolution.source,
          jwtAudience,
          ...(jwtDebug ? { jwtDebug } : {}),
          httpStatus: result.status,
          body: result.json ?? result.text,
        };
        redirectUrl = pickRedirectUrl(result.json);
      } else {
        console.log("[payment/initiate] msisdn normalization:", {
          input: data.telephoneVotant,
          normalized: msisdn,
          userBlockMsisdn: userBase.msisdn,
        });

        const validateBody = {
          correlationId,
          user: { ...userBase, mccmnc: meta.mccmnc! },
          data: purchaseData,
          ...(purchaseCustomization ? { customization: purchaseCustomization } : {}),
          pin: data.otpCode!.trim(),
          paymentMethod: meta.paymentMethod,
          invoice: { amount: amountFcfa },
        };
        result = await dvPassPurchaseValidate(dv, token, validateBody);
        dvpassLog = {
          flow: "validate",
          audienceSource: audienceResolution.source,
          jwtAudience,
          ...(jwtDebug ? { jwtDebug } : {}),
          validateHttpStatus: result.status,
          validateBody: result.json ?? result.text,
        };
        redirectUrl = pickRedirectUrl(result.json);
      }

      const providerOp = pickOperationId(result.json);
      const hub2IntentId = pickHub2IntentIdFromDvJson(result.json);
      const hub2PaymentId = pickHub2PaymentEntityIdFromDvJson(result.json);
      const newStatus =
        meta.flow === "forward"
          ? "processing"
          : getValidateIntentStatus(result.ok, result.json, redirectUrl);

      const rawExtended = {
        ...sanitizeForLog(data),
        dvpass: dvpassLog,
      };

      const initiateFailureCode =
        newStatus === "failed" ? deriveFailureCodeFromInitiateBody(result.json) : null;
      const initiateFailureDetail =
        newStatus === "failed"
          ? (() => {
              const em = extractDvPassErrorMessage(result.json);
              return em ? truncateFailureDetail(em) : null;
            })()
          : null;
      const failurePatch =
        newStatus === "failed" && initiateFailureCode
          ? {
              failure_code: initiateFailureCode,
              failure_detail: initiateFailureDetail,
            }
          : {};

      await supabase
        .from("payment_intents")
        .update({
          status: newStatus,
          provider_operation_id: providerOp,
          ...(hub2IntentId ? { hub2_intent_id: hub2IntentId } : {}),
          ...(hub2PaymentId ? { hub2_payment_id: hub2PaymentId } : {}),
          updated_at: new Date().toISOString(),
          raw_request: rawExtended,
          ...failurePatch,
        })
        .eq("correlation_id", correlationId);

      if (!result.ok) {
        const msg =
          extractDvPassErrorMessage(result.json) ??
          "Paiement refuse ou erreur operateur";
        console.error("[dvpass] initiate refused", {
          correlationId,
          flow: dvpassLog.flow,
          httpStatus: result.status,
          body: result.json ?? result.text,
          responseHeaders: result.responseHeaders,
          ...(jwtDebug ? { jwtDebug } : {}),
        });
        return NextResponse.json(
          {
            success: false,
            error: msg,
            paymentId: correlationId,
            ...(isDvPassDebugEnabled()
              ? {
                  dvpassDebug: {
                    httpStatus: result.status,
                    body: result.json ?? result.text,
                    responseHeaders: result.responseHeaders,
                    jwtAudience,
                    audienceSource: audienceResolution.source,
                    ...(jwtDebug ? { jwtDebug } : {}),
                  },
                }
              : {}),
          },
          { status: 502 }
        );
      }

      if (newStatus === "completed") {
        await applyResponsesForIntent(correlationId, supabase, providerOp);
      }

      return NextResponse.json({
        success: true,
        paymentId: correlationId,
        status: newStatus,
        redirectUrl,
        message:
          newStatus === "completed"
            ? "Paiement valide et votes appliques."
            : meta.flow === "forward"
              ? "Ouvrez Wave pour confirmer le paiement."
              : "Paiement initie. Validation en cours.",
        ...(newStatus === "failed" && initiateFailureCode
          ? {
              failureCode: initiateFailureCode,
              failureMessage: userFacingPaymentFailureMessage(
                initiateFailureCode,
                initiateFailureDetail
              ),
            }
          : {}),
      });
    }

    // Fallback local (sans DVPass): confirmer immediatement pour les tests et
    // crediter le couple correspondant.
    await applyResponsesForIntent(correlationId, supabase, null);

    return NextResponse.json({
      success: true,
      paymentId: correlationId,
      status: "completed",
      message: "Paiement enregistre et votes appliques.",
    });
  } catch (error) {
    console.error("Payment initiate error:", error);
    const message =
      error instanceof Error && error.message.includes("Missing NEXT_PUBLIC")
        ? "Service de paiement non configure."
        : error instanceof Error && error.message.includes("DVPass packageId manquant")
          ? error.message
          : "Une erreur est survenue lors du paiement";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
