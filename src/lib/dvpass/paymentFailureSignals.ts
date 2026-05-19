/**
 * DVPass / opérateurs renvoient souvent HTTP 200 + status PENDING/PROCESSING
 * alors que le corps contient déjà message / error (solde insuffisant, refus, etc.).
 */

const DIAGNOSTIC_KEYS = [
  "message",
  "error",
  "detail",
  "description",
  "reason",
  "userMessage",
  "failureMessage",
  "statusMessage",
  "resultText",
  "operatorMessage",
  "gatewayMessage",
  "customerMessage",
  "responseMessage",
  "title",
  "exception",
  "errorMessage",
  "errMsg",
  "localizedMessage",
  "failureReason",
] as const;

export function collectDvPassDiagnosticStrings(
  ...blocks: (Record<string, unknown> | null | undefined)[]
): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (!block) continue;
    for (const key of DIAGNOSTIC_KEYS) {
      const v = block[key];
      if (typeof v === "string" && v.trim()) parts.push(v.trim());
      else if (typeof v === "number" && Number.isFinite(v)) parts.push(String(v));
    }
  }
  return parts.join(" | ");
}

/** Heuristique FR/EN sur les messages d’erreur métier (hors statuts normalisés). */
export function dvPassTextSuggestsPaymentFailure(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return (
    /\b(insuffis|insufficient|low balance|not enough|fonds insuff|solde insuff|cr[eé]dit insuff|portefeuille insuff)\b/i.test(
      t
    ) ||
    /\b(declin|refus|refused|rejected|denied|do not honor|risque|blocked|bloqu|limite)\b/i.test(
      t
    ) ||
    /\b(échec|echec|failed|failure|payment err|erreur de pai|annul\w* pai|cancel\w* pay)\b/i.test(
      t
    ) ||
    /\b(opération refus|operation refus|transaction refus|unable to (complete|process))\b/i.test(
      t
    )
  );
}

export function dvPassBlocksExplicitlyNotOk(
  ...blocks: (Record<string, unknown> | null | undefined)[]
): boolean {
  for (const block of blocks) {
    if (!block) continue;
    if (block.success === false || block.ok === false) return true;
  }
  return false;
}
