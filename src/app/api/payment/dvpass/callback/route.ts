import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { applyResponsesForIntent } from "@/lib/payment/applyResponsesForIntent";
import {
  expandDvPassCallbackBaseUrls,
  getDvPassConfig,
  getDvPassPurchaseCallbackUrl,
  verifyDvPassCallbackSignature,
} from "@/lib/dvpass";
import {
  deriveFailureCodeFromCallbackParams,
  normalizeFailureCode,
  truncateFailureDetail,
} from "@/lib/payment/paymentFailureMeta";

function redirectHome(request: Request, query: Record<string, string>) {
  if (query.payment === "ok" && query.paymentId) {
    const u = new URL("/vote/success", request.url);
    u.searchParams.set("paymentId", query.paymentId);
    return NextResponse.redirect(u);
  }

  const failId = query.paymentId?.trim();
  if (query.payment === "error" && failId) {
    const u = new URL("/vote/failure", request.url);
    u.searchParams.set("paymentId", failId);
    for (const [k, v] of Object.entries(query)) {
      if (k === "payment" || k === "paymentId" || !v) continue;
      u.searchParams.set(k, v);
    }
    return NextResponse.redirect(u);
  }

  const u = new URL("/", request.url);
  for (const [k, v] of Object.entries(query)) {
    if (v) u.searchParams.set(k, v);
  }
  return NextResponse.redirect(u);
}

/** Base callback sans query — alignée sur ce que le navigateur reçoit (www, chemin). */
function callbackBaseFromRequest(request: Request): string {
  const u = new URL(request.url);
  const path = u.pathname.replace(/\/+$/, "") || "/";
  return `${u.origin}${path}`;
}

/**
 * Redirection d’erreur DVPass (sans `signature`) — ex. Wave `code` / `detail` / `message`.
 * À ne pas confondre avec l’échec de vérification HMAC du callback succès.
 */
function isDvPassCallbackErrorQuery(url: URL): boolean {
  const code = url.searchParams.get("code")?.trim();
  if (!code) return false;
  return Boolean(
    url.searchParams.get("message")?.trim() || url.searchParams.get("detail")?.trim()
  );
}

function redirectDvPassProviderError(request: Request, url: URL) {
  const code = (url.searchParams.get("code") ?? "").trim().slice(0, 32);
  const detail = (
    url.searchParams.get("detail") ??
    url.searchParams.get("message") ??
    ""
  )
    .trim()
    .slice(0, 200);
  const q: Record<string, string> = { payment: "error", reason: "dvpass" };
  if (code) q.dvCode = code;
  if (detail) q.dvDetail = detail;
  const correlationEarly = url.searchParams.get("correlationId")?.trim();
  if (correlationEarly) q.paymentId = correlationEarly;
  console.warn("[dvpass] callback error query (no signature)", {
    code: code || undefined,
    detailPreview: detail.slice(0, 120) || undefined,
  });
  return redirectHome(request, q);
}

/**
 * Callback navigateur après flux Forward (ex. Wave) — query signée (DV Pass V2.1 §3.4.3 / §5.1).
 */
export async function GET(request: Request) {
  const dv = getDvPassConfig();
  const callbackBaseEnv = getDvPassPurchaseCallbackUrl();
  const url = new URL(request.url);
  const signature = url.searchParams.get("signature");

  if (!dv) {
    return redirectHome(request, { payment: "error", reason: "config" });
  }

  if (!signature?.trim()) {
    if (isDvPassCallbackErrorQuery(url)) {
      return redirectDvPassProviderError(request, url);
    }
    return new NextResponse("Paramètres callback invalides (signature manquante).", {
      status: 400,
    });
  }

  const callbackBasesUnique = expandDvPassCallbackBaseUrls([
    callbackBaseFromRequest(request),
    ...(callbackBaseEnv ? [callbackBaseEnv] : []),
  ]);

  const signatureOk = verifyDvPassCallbackSignature({
    callbackBaseUrl: callbackBasesUnique,
    searchParams: url.searchParams,
    secret: dv.secret,
    signatureParam: signature,
    rawSearch: url.search,
  });

  if (!signatureOk) {
    const dbg = process.env.DVPASS_CALLBACK_SIGNATURE_DEBUG?.trim().toLowerCase();
    if (dbg === "1" || dbg === "true" || dbg === "yes" || dbg === "on") {
      console.warn("[dvpass/callback] signature mismatch (debug)", {
        bases: callbackBasesUnique,
        searchLength: url.search.length,
        paramKeys: [...url.searchParams.keys()],
        secretEncoding: process.env.DVPASS_SECRET_ENCODING?.trim() || "raw",
      });
    }
    // Flux Forward : le notify peut déjà avoir marqué l'intent « completed » avant le retour navigateur.
    // §5.1 : si la query ne matche pas (params Wave, encodage) mais le paiement est déjà confirmé en base, on évite l'écran « Signature invalide ».
    const earlyCorrelation = url.searchParams.get("correlationId")?.trim() ?? "";
    const earlyStatus = (url.searchParams.get("status") ?? "").trim().toUpperCase();
    if (earlyCorrelation && earlyStatus === "SUCCESS") {
      const supabaseEarly = getSupabaseAdmin();
      const { data: intentRow } = await supabaseEarly
        .from("payment_intents")
        .select("status")
        .eq("correlation_id", earlyCorrelation)
        .maybeSingle();
      if (intentRow?.status === "completed") {
        console.warn(
          "[dvpass/callback] signature refusee mais intent deja complete (ex. notify) — redirection ok",
          { correlationPreview: earlyCorrelation.slice(0, 8) }
        );
        return redirectHome(request, { payment: "ok", paymentId: earlyCorrelation });
      }
    }
    // Orange : l’erreur vient du JSON /purchase/validate (initiate). Wave : souvent ce callback ;
    // si le HMAC ne matche pas, on confirme quand même l’échec via l’API DV « retrieve » (JWT marchand),
    // comme sur /api/payment/status au timeout — pas depuis la query navigateur seule.
    if (earlyCorrelation && earlyStatus === "ERROR") {
      let retrieveConfirmed = false;
      try {
        const supabaseErr = getSupabaseAdmin();
        const { data: intentErr } = await supabaseErr
          .from("payment_intents")
          .select("status, wallet_id, nb_votes, provider_operation_id")
          .eq("correlation_id", earlyCorrelation)
          .maybeSingle();

        const opFromUrl = url.searchParams.get("operationId")?.trim() || null;
        if (
          intentErr &&
          (intentErr.status === "pending" || intentErr.status === "processing")
        ) {
          let configWithPackage = dv;
          if (!dv.packageId && intentErr.wallet_id && typeof intentErr.nb_votes === "number") {
            const { resolveDvPassWalletAudience } = await import("@/lib/dvpass/walletAudience");
            const resolved = resolveDvPassWalletAudience({
              walletId: intentErr.wallet_id,
              nbVotes: intentErr.nb_votes,
            });
            if (resolved.overrides?.packageId) {
              configWithPackage = { ...dv, packageId: resolved.overrides.packageId };
            }
          }
          const { retrieveDvPassOperation, extractFailureFromDvResponse } = await import(
            "@/lib/dvpass/retrieve"
          );
          const dvResponse = await retrieveDvPassOperation(configWithPackage, {
            correlationId: earlyCorrelation,
            operationId: opFromUrl ?? intentErr.provider_operation_id ?? undefined,
          });
          if (dvResponse?.data?.status === "ERROR") {
            const failure = extractFailureFromDvResponse(dvResponse);
            if (failure) {
              const failureCode = normalizeFailureCode(failure.code);
              const failureDetail = truncateFailureDetail(failure.message);
              await supabaseErr
                .from("payment_intents")
                .update({
                  status: "failed",
                  provider_operation_id:
                    dvResponse.data.operationId || opFromUrl || intentErr.provider_operation_id || null,
                  failure_code: failureCode,
                  failure_detail: failureDetail || null,
                  updated_at: new Date().toISOString(),
                })
                .eq("correlation_id", earlyCorrelation)
                .in("status", ["pending", "processing"]);
              retrieveConfirmed = true;
              console.warn(
                "[dvpass/callback] signature refusee + ERROR — intent marque failed apres retrieve DV",
                { correlationPreview: earlyCorrelation.slice(0, 8), failureCode }
              );
            }
          }
        }
      } catch (e) {
        console.error("[dvpass/callback] retrieve apres ERROR + signature refusee:", e);
      }

      const errQ: Record<string, string> = {
        payment: "error",
        paymentId: earlyCorrelation,
        reason: retrieveConfirmed ? "dv_retrieve_confirmed" : "signature_mismatch",
      };
      const c = url.searchParams.get("code")?.trim();
      const d =
        (url.searchParams.get("detail") ?? url.searchParams.get("message") ?? "").trim().slice(0, 200);
      if (c) errQ.dvCode = c.slice(0, 32);
      if (d) errQ.dvDetail = d;
      console.warn("[dvpass/callback] signature refusee + status ERROR — redirection page echec", {
        correlationPreview: earlyCorrelation.slice(0, 8),
        retrieveConfirmed,
      });
      return redirectHome(request, errQ);
    }
    return new NextResponse("Signature invalide", { status: 400 });
  }

  const status = (url.searchParams.get("status") ?? "").trim().toUpperCase();
  const correlationId = url.searchParams.get("correlationId")?.trim() ?? "";
  const operationId = url.searchParams.get("operationId")?.trim() ?? null;

  if (!correlationId) {
    return redirectHome(request, { payment: "error", reason: "missing_id" });
  }

  const supabase = getSupabaseAdmin();

  if (status === "SUCCESS") {
    await applyResponsesForIntent(correlationId, supabase, operationId);
    return redirectHome(request, { payment: "ok", paymentId: correlationId });
  }

  if (status === "ERROR") {
    const dvCode = url.searchParams.get("code")?.trim().slice(0, 32) ?? null;
    const dvDetail = (
      url.searchParams.get("detail") ??
      url.searchParams.get("message") ??
      ""
    )
      .trim()
      .slice(0, 200);
    const failureCode = deriveFailureCodeFromCallbackParams(dvCode, dvDetail || null);
    const failureDetail = truncateFailureDetail(
      [dvCode, dvDetail].filter(Boolean).join(" — ")
    );
    await supabase
      .from("payment_intents")
      .update({
        status: "failed",
        provider_operation_id: operationId,
        failure_code: failureCode,
        failure_detail: failureDetail || null,
        updated_at: new Date().toISOString(),
      })
      .eq("correlation_id", correlationId);
    const errQ: Record<string, string> = { payment: "error", paymentId: correlationId };
    if (dvCode) errQ.dvCode = dvCode;
    if (dvDetail) errQ.dvDetail = dvDetail;
    return redirectHome(request, errQ);
  }

  return redirectHome(request, { payment: "pending" });
}
