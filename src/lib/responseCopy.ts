/** Libellés UI — sondage à choix, pas « vote » électoral */

export const RESPONSE_COPY = {
  ctaValidate: "Valider ma réponse",
  ctaAgain: "Répondre à nouveau",
  modalHeadingPrefix: "Répondre :",
  stepPack: "Étape 1 / 2 — Pack",
  stepPayment: "Étape 2 / 2 — Paiement",
  backToPacks: "Packs de réponses",
  packChooserTitle: "Choisissez votre pack de réponses",
  infoChances:
    "Plus vous répondez, plus vous avez des chances de remporter le gros lot.",
  continuePayment: "Continuer vers le paiement",
  successTitle: "Réponse enregistrée",
  successThanks: "Merci pour votre participation",
  periodClosed: "Les participations sont closes.",
  responsesClosed: "Participations closes",
  paymentPeriodEnded: "La période de participation est terminée.",
} as const;

export function responseUnit(count: number): string {
  return count === 1 ? "réponse" : "réponses";
}

export function formatRegisteredResponses(count: number, choice: string): string {
  const n = count.toLocaleString("fr-FR");
  if (count === 1) return `${n} réponse enregistrée pour ${choice}`;
  return `${n} réponses enregistrées pour ${choice}`;
}

export function formatTotalResponses(total: number): string {
  return `${total.toLocaleString("fr-FR")} ${responseUnit(total)} au total`;
}
