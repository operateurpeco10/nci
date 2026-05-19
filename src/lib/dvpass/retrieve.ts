import type { DvPassConfig } from "./config";
import { dvPassMerchantFetchHeaders } from "./http";
import { buildDvPassJwtPayload, signDvPassJwt } from "./jwt";

/**
 * DVPass API "Retrieve an operation" (doc p. 22-23)
 * GET /service/operations/:operationId?correlationId=xxx
 */

export type DvPassOperationStatus = "SUCCESS" | "ERROR" | "PENDING";

export type DvPassRetrieveOperationResponse = {
  code: number;
  message: string | null;
  data: {
    status: DvPassOperationStatus;
    type: "ONE-SHOT" | "INVOICE" | string;
    operationId: string;
    correlationId: string;
    creationDate: string;
    date?: string | null;
    // Error info (si ERROR) - au niveau racine de data, pas dans un sous-objet
    code?: number; // Code erreur DV (ex: 4300 = Invalid PIN)
    message?: string; // Message user-friendly
    detail?: string; // Détail court (ex: "Invalid/Expired PIN")
  } | null;
};

/**
 * Récupère le statut réel d'une opération DVPass via leur API /service/operations
 * Doc p. 22: https://:domain/:base_url/operations/:operationId?correlationId=xxx
 */
export async function retrieveDvPassOperation(
  config: DvPassConfig,
  params: {
    correlationId?: string;
    operationId?: string;
  }
): Promise<DvPassRetrieveOperationResponse | null> {
  const { correlationId, operationId } = params;

  if (!correlationId && !operationId) {
    console.warn("[dvpass/retrieve] correlationId ou operationId requis");
    return null;
  }

  try {
    const baseUrl = `${config.baseUrl}/service/operations`;

    // Si operationId fourni, l'utiliser en path; sinon query param correlationId
    const url = operationId
      ? `${baseUrl}/${operationId}`
      : `${baseUrl}?correlationId=${encodeURIComponent(correlationId!)}`;

    // Générer JWT pour authentification (doc p. 22: audience claim "pack" MUST be provided)
    const jwtPayload = buildDvPassJwtPayload(config, null);
    const bearerToken = signDvPassJwt(config.secret, jwtPayload);

    const headers = {
      ...dvPassMerchantFetchHeaders(),
      Authorization: `Bearer ${bearerToken}`,
    };

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.warn("[dvpass/retrieve] API error", {
        status: response.status,
        statusText: response.statusText,
        correlationId,
        operationId,
      });
      return null;
    }

    const json = (await response.json()) as DvPassRetrieveOperationResponse;

    console.log("[dvpass/retrieve] response", {
      code: json.code,
      status: json.data?.status,
      operationId: json.data?.operationId,
      correlationId: json.data?.correlationId,
      errorCode: json.data?.code,
      errorDetail: json.data?.detail,
    });

    return json;
  } catch (err) {
    console.error("[dvpass/retrieve] fetch error:", err);
    return null;
  }
}

/**
 * Parse failure code from DV retrieve response
 * Structure réelle: { data: { status: "ERROR", code: 4300, message: "...", detail: "..." } }
 */
export function extractFailureFromDvResponse(
  response: DvPassRetrieveOperationResponse | null
): { code: string; message: string } | null {
  if (!response?.data) return null;

  const { status, code, message, detail } = response.data;

  if (status === "ERROR") {
    // Mapper le code numérique DV vers un code string canonique (doc p. 35)
    let codeStr = "unknown";
    if (typeof code === "number") {
      // Insufficient funds (3110-3113: provider level, 4110-4113: system level)
      if ((code >= 3110 && code <= 3113) || (code >= 4110 && code <= 4113)) {
        codeStr = "insufficient_funds";
      }
      // Invalid/Expired PIN (3300/4300)
      else if (code === 3300 || code === 4300) {
        codeStr = "invalid_credentials";
      }
      // Too many attempts (3302/4302)
      else if (code === 3302 || code === 4302) {
        codeStr = "invalid_credentials";
      }
      // Purchase refused (3303/4303)
      else if (code === 3303 || code === 4303) {
        codeStr = "refused_operator";
      }
      // User cancelled (3303/4303 selon contexte, ou annulation explicite)
      else if (code === 3004 || code === 4004 || code === 3401 || code === 4401) {
        codeStr = "cancelled_user";
      }
      // Autres codes: refusé opérateur
      else if (code >= 3000) {
        codeStr = "refused_operator";
      }
    }

    return {
      code: codeStr,
      message: detail || message || "Payment failed",
    };
  }

  return null;
}
