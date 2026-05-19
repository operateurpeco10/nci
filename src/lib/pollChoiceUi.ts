/** Style visuel par position (1er choix = vert, 2e = orange) — pas de données métier */
export type ChoiceAccent = "cafe" | "the";

export function accentForDisplayIndex(index: number): ChoiceAccent {
  return index % 2 === 0 ? "cafe" : "the";
}

/** Libellé générique d’emplacement (Réponse A, Réponse B, …) */
export function responseSlotLabel(index: number): string {
  return `Réponse ${String.fromCharCode(65 + index)}`;
}

export function slotIndexFromChoiceId(id: string, fallbackIndex = 0): number {
  if (id === "a") return 0;
  if (id === "b") return 1;
  return fallbackIndex;
}
