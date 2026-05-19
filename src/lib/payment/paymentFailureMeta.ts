/**
 * Codes d'échec canoniques (stockés en base + renvoyés par /api/payment/status).
 * Libellés FR pour l'utilisateur final (modal vote).
 */

export type PaymentFailureCode =
  | "insufficient_funds"
  | "refused_operator"
  | "cancelled_user"
  | "timeout"
  | "invalid_credentials"
  | "unknown";

const INSUFF_STATUSES = new Set([
  "INSUFFICIENT_FUNDS",
  "INSUFFICIENT_BALANCE",
  "INSUFFICIENTBALANCE",
  "INSUFFICIENT_CREDIT",
  "LOW_BALANCE",
  "NOT_ENOUGH_BALANCE",
]);

const CANCEL_STATUSES = new Set(["CANCELLED", "CANCELED", "ABORTED"]);

const REFUSED_STATUSES = new Set([
  "FAILED",
  "FAILURE",
  "FAIL",
  "DECLINED",
  "REJECTED",
  "REFUSED",
  "ERROR",
  "DENIED",
  "NOK",
  "INVALID",
  "EXPIRED",
  "NOT_AUTHORIZED",
  "UNAUTHORIZED",
  "DO_NOT_HONOR",
]);

function textSuggestsInsufficient(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return /\b(insuffis|insufficient|low balance|not enough|fonds insuff|solde insuff|cr[eé]dit insuff|portefeuille insuff)\b/i.test(
    t
  );
}

function textSuggestsCancelled(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /\b(cancel|annul|abandon)\b/i.test(t);
}

/** À partir du notify (statut DV + textes diagnostics). */
export function deriveFailureCodeFromNotify(
  statusRaw: string,
  diagnosticText: string,
  bodySuggestsFailure: boolean
): PaymentFailureCode {
  const s = statusRaw.trim().toUpperCase();
  const diag = diagnosticText.trim();

  if (INSUFF_STATUSES.has(s)) return "insufficient_funds";
  if (textSuggestsInsufficient(diag)) return "insufficient_funds";

  if (CANCEL_STATUSES.has(s) || (bodySuggestsFailure && textSuggestsCancelled(diag)))
    return "cancelled_user";

  if (REFUSED_STATUSES.has(s) || bodySuggestsFailure) {
    if (textSuggestsInsufficient(diag)) return "insufficient_funds";
    return "refused_operator";
  }

  return "unknown";
}


/** Query callback DVPass (code / message). */
export function deriveFailureCodeFromCallbackParams(
  dvCode: string | null,
  dvDetail: string | null
): PaymentFailureCode {
  const code = (dvCode ?? "").trim();
  const detail = (dvDetail ?? "").trim();
  const merged = `${code} ${detail}`.toLowerCase();

  if (textSuggestsInsufficient(merged)) return "insufficient_funds";
  if (textSuggestsCancelled(merged)) return "cancelled_user";
  if (/insufficient|4103|4003|solde|balance|funds/i.test(merged)) return "insufficient_funds";
  if (/4300|4301|pin|otp|invalid.*pin|wrong pin/i.test(merged)) return "invalid_credentials";
  if (code && code !== "0") return "refused_operator";
  return "unknown";
}

export function failureCodeFromTimeout(): PaymentFailureCode {
  return "timeout";
}

const PIN_ERROR_CODES = new Set([4300, 4301]);

/** Réponse synchrone initiate (validate / sendoptin) quand statut failed. */
export function deriveFailureCodeFromInitiateBody(json: unknown): PaymentFailureCode {
  if (!json || typeof json !== "object") return "unknown";
  const root = json as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : null;
  const nested =
    data?.data && typeof data.data === "object" ? (data.data as Record<string, unknown>) : null;

  const pickNum = (o: Record<string, unknown> | null) => {
    if (!o) return null;
    const c = o.code;
    if (typeof c === "number" && Number.isFinite(c)) return c;
    if (typeof c === "string" && /^\d+$/.test(c.trim())) return parseInt(c.trim(), 10);
    return null;
  };

  const code = pickNum(root) ?? pickNum(data) ?? pickNum(nested);
  if (code !== null && PIN_ERROR_CODES.has(code)) return "invalid_credentials";

  const msg = [
    typeof root.message === "string" ? root.message : "",
    typeof root.detail === "string" ? root.detail : "",
    typeof data?.message === "string" ? data.message : "",
    typeof nested?.message === "string" ? nested.message : "",
  ].join(" ");

  if (textSuggestsInsufficient(msg)) return "insufficient_funds";
  if (textSuggestsCancelled(msg)) return "cancelled_user";
  if (msg.trim()) return "refused_operator";
  return "unknown";
}

/** Hub2 : `data.failure` sur les events `payment.failed` (ex. `customer_insufficient_funds`). */
export function formatHub2PaymentFailureLine(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  const failure = d.failure;
  if (!failure || typeof failure !== "object") return "";
  const f = failure as Record<string, unknown>;
  const code = typeof f.code === "string" ? f.code.trim() : "";
  const message = typeof f.message === "string" ? f.message.trim() : "";
  return [code, message].filter(Boolean).join(" — ");
}

/** Dérive un code canonique à partir du bloc `data` Hub2 (prioritaire sur les heuristiques notify classiques). */
export function deriveFailureCodeFromHub2PaymentData(data: unknown): PaymentFailureCode | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const failure = d.failure;
  if (!failure || typeof failure !== "object") return null;
  const code = String((failure as Record<string, unknown>).code ?? "").trim();
  const message = String((failure as Record<string, unknown>).message ?? "").trim();
  const merged = `${code} ${message}`.toLowerCase();
  if (
    code.toLowerCase().includes("insufficient") ||
    merged.includes("insufficient_funds") ||
    merged.includes("insufficient funds") ||
    merged.includes("customer_insufficient_funds") ||
    merged.includes("not enough funds")
  ) {
    return "insufficient_funds";
  }
  if (/\b(cancel|annul|abandon)\b/i.test(merged)) return "cancelled_user";
  if (/\b(pin|otp|credential|authentication)\b/i.test(merged)) return "invalid_credentials";
  if (code || message) return "refused_operator";
  return null;
}

export function normalizeFailureCode(raw: string | null | undefined): PaymentFailureCode {
  if (!raw || !raw.trim()) return "unknown";
  const r = raw.trim().toLowerCase();
  const allowed: PaymentFailureCode[] = [
    "insufficient_funds",
    "refused_operator",
    "cancelled_user",
    "timeout",
    "invalid_credentials",
    "unknown",
  ];
  return (allowed.includes(r as PaymentFailureCode) ? r : "unknown") as PaymentFailureCode;
}

export function userFacingPaymentFailureMessage(
  code: PaymentFailureCode,
  detail?: string | null
): string {
  const d = (detail ?? "").trim();
  switch (code) {
    case "insufficient_funds":
      return "Paiement refusé : solde insuffisant sur votre compte mobile money. Rechargez puis réessayez.";
    case "cancelled_user":
      return "Paiement annulé ou interrompu. Vous pouvez réessayer quand vous voulez.";
    case "timeout":
      return "Délai dépassé sans confirmation du paiement. Si l’opérateur a refusé (ex. solde insuffisant), rechargez puis réessayez.";
    case "invalid_credentials":
      return "Code PIN ou OTP incorrect. Vérifiez le code puis réessayez.";
    case "refused_operator":
      return d.length > 0
        ? d.slice(0, 180)
        : "Paiement refusé par l’opérateur. Vérifiez votre compte puis réessayez.";
    default:
      return d.length > 0
        ? `Paiement non abouti : ${d.slice(0, 180)}`
        : "Paiement non abouti (solde insuffisant, refus opérateur ou annulation). Vérifiez votre compte puis réessayez.";
  }
}

export function truncateFailureDetail(s: string, max = 280): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
