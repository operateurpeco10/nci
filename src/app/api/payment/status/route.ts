import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  failureCodeFromTimeout,
  normalizeFailureCode,
  userFacingPaymentFailureMessage,
} from "@/lib/payment/paymentFailureMeta";
import { getDvPassConfig } from "@/lib/dvpass/config";
import { retrieveDvPassOperation, extractFailureFromDvResponse } from "@/lib/dvpass/retrieve";

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

/**
 * Orange validate : le user a déjà saisi le PIN AVANT de cliquer "Confirmer".
 * → Validation instantanée (2-5s) par le provider.
 * → Si échec : pas de webhook, on interroge API DV au timeout pour récupérer le code erreur.
 * → 3s = validation provider moyenne (~2s) + marge minimale.
 */
const STATUS_TIMEOUT_ORANGE_MS = 3 * 1000;

/**
 * MTN/Moov sendoptin : Push USSD peut prendre plus de temps (user reçoit menu puis valide).
 * → Laisser ~70s pour que le user réponde au Push USSD.
 */
const STATUS_TIMEOUT_MTN_MOOV_MS = 70 * 1000;

/**
 * Wave forward : le user saisit le PIN APRÈS le redirect dans l'app Wave.
 * → Si échec (annulation/PIN incorrect) : DV reste PENDING indéfiniment (pas de notif du provider).
 * → Timeout = abandon présumé. 45s = temps raisonnable pour ouvrir app + valider.
 */
const STATUS_TIMEOUT_WAVE_MS = 45 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const paymentId = searchParams.get("paymentId");

  if (!paymentId?.trim()) {
    return NextResponse.json(
      { success: false, error: "paymentId manquant" },
      { status: 400, headers: noStoreHeaders }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("payment_intents")
      .select(
        "correlation_id, status, choice_id, nb_votes, wallet_id, created_at, updated_at, provider_operation_id, failure_code, failure_detail"
      )
      .eq("correlation_id", paymentId.trim())
      .maybeSingle();

    if (error) {
      console.error("Supabase payment status:", error);
      return NextResponse.json(
        { success: false, error: "Impossible de lire le statut" },
        { status: 500, headers: noStoreHeaders }
      );
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: "Paiement introuvable" },
        { status: 404, headers: noStoreHeaders }
      );
    }

    let choiceLabel: string | null = null;
    if (typeof data.choice_id === "string" && data.choice_id.trim()) {
      const { data: choiceRow, error: choiceErr } = await supabase
        .from("poll_choices")
        .select("label")
        .eq("id", data.choice_id.trim())
        .maybeSingle();
      if (choiceErr) {
        console.error("Supabase payment status (choice label):", choiceErr);
      } else if (choiceRow && typeof choiceRow.label === "string") {
        choiceLabel = choiceRow.label;
      }
    }

    let status = data.status;
    const isProcessing = status === "pending" || status === "processing";
    const createdRaw = data.created_at as string | null | undefined;
    const fallbackForAge = !createdRaw ? (data.updated_at as string | null | undefined) : null;
    const ageSource = createdRaw ?? fallbackForAge;
    const createdAtMs = ageSource ? new Date(ageSource).getTime() : NaN;
    const ageMs = Number.isFinite(createdAtMs) ? Date.now() - createdAtMs : 0;
    const timeoutMs =
      data.wallet_id === "wave_ci"
        ? STATUS_TIMEOUT_WAVE_MS
        : data.wallet_id === "mtn_ci" || data.wallet_id === "moov_ci"
          ? STATUS_TIMEOUT_MTN_MOOV_MS
          : STATUS_TIMEOUT_ORANGE_MS;
    const hasTimedOut = isProcessing && ageMs > timeoutMs;

    // Safety net: avoid endless polling when DVPass callback is missing.
    // A later success webhook can still move the intent to completed.
    if (hasTimedOut) {
      status = "failed";

      // Avant de marquer timeout, on interroge l'API DV pour récupérer le vrai statut/code erreur
      let finalFailureCode = failureCodeFromTimeout();
      let finalFailureDetail: string | null = null;

      try {
        const config = getDvPassConfig();
        if (!config) {
          throw new Error("DVPass config not available");
        }

        // Récupérer packageId depuis wallet_id + nb_votes pour l'API DV (si config global n'en a pas)
        let configWithPackage = config;
        if (!config.packageId && data.wallet_id && typeof data.nb_votes === "number") {
          const { resolveDvPassWalletAudience } = await import("@/lib/dvpass/walletAudience");
          const resolved = resolveDvPassWalletAudience({
            walletId: data.wallet_id,
            nbVotes: data.nb_votes,
          });
          if (resolved.overrides?.packageId) {
            configWithPackage = { ...config, packageId: resolved.overrides.packageId };
          }
        }

        const dvResponse = await retrieveDvPassOperation(configWithPackage, {
          correlationId: paymentId.trim(),
          operationId: data.provider_operation_id || undefined,
        });

        if (dvResponse?.data) {
          const dvStatus = dvResponse.data.status;

          if (dvStatus === "SUCCESS") {
            // Rare: DV dit success mais on n'a pas reçu le webhook
            console.warn("[payment/status] DV says SUCCESS but no webhook received", {
              paymentId: paymentId.trim(),
              operationId: dvResponse.data.operationId,
            });
            // On pourrait marquer completed ici, mais prudence: on log et on laisse timeout
            // (un webhook tardif peut encore arriver et appliquer les votes)
          } else if (dvStatus === "ERROR") {
            // DV confirme l'échec, récupérer le code réel
            const failure = extractFailureFromDvResponse(dvResponse);
            if (failure) {
              finalFailureCode = normalizeFailureCode(failure.code);
              finalFailureDetail = failure.message.substring(0, 200);
              console.log("[payment/status] DV confirms ERROR with code", {
                paymentId: paymentId.trim(),
                failureCode: finalFailureCode,
                failureMessage: failure.message,
              });
            }
          } else {
            // PENDING: DV n'a pas encore de statut final, on marque timeout comme prévu
            console.log("[payment/status] DV still PENDING after timeout", {
              paymentId: paymentId.trim(),
              ageMs,
            });
          }
        }
      } catch (err) {
        console.error("[payment/status] DV retrieve error, using timeout code:", err);
      }

      await supabase
        .from("payment_intents")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
          failure_code: finalFailureCode,
          failure_detail: finalFailureDetail,
        })
        .eq("correlation_id", paymentId.trim())
        .in("status", ["pending", "processing"]);

      console.warn("[payment/status] timed out pending intent -> failed", {
        paymentId: paymentId.trim(),
        ageMs,
        timeoutMs,
        wallet: data.wallet_id,
        providerOperationId: data.provider_operation_id,
        finalFailureCode,
      });
    }

    // Re-fetch data après éventuel update timeout pour avoir les vrais codes
    const finalData = hasTimedOut
      ? (
          await supabase
            .from("payment_intents")
            .select("failure_code, failure_detail")
            .eq("correlation_id", paymentId.trim())
            .maybeSingle()
        ).data
      : null;

    const isFailed = status === "failed";
    const resolvedFailureCode = normalizeFailureCode(
      typeof (finalData?.failure_code ?? data.failure_code) === "string"
        ? (finalData?.failure_code ?? data.failure_code)
        : null
    );
    const resolvedFailureDetail =
      typeof (finalData?.failure_detail ?? data.failure_detail) === "string" &&
      (finalData?.failure_detail ?? data.failure_detail).trim()
        ? (finalData?.failure_detail ?? data.failure_detail).trim()
        : null;

    return NextResponse.json(
      {
        success: true,
        status,
        walletId: data.wallet_id,
        choiceId: data.choice_id,
        nbVotes: data.nb_votes,
        choiceLabel,
        createdAt: data.created_at ?? data.updated_at ?? null,
        ...(isFailed
          ? {
              failureCode: resolvedFailureCode,
              failureMessage: userFacingPaymentFailureMessage(
                resolvedFailureCode,
                resolvedFailureDetail
              ),
            }
          : {}),
      },
      { headers: noStoreHeaders }
    );
  } catch (e) {
    console.error("Payment status error:", e);
    return NextResponse.json(
      { success: false, error: "Configuration ou serveur indisponible" },
      { status: 500, headers: noStoreHeaders }
    );
  }
}
