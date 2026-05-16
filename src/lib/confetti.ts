import confetti from "canvas-confetti";

const NCI_COLORS = ["#144285", "#22c55e", "#f97316", "#ffffff"];

/** Confettis au succès — couleurs NCI, respecte prefers-reduced-motion */
export function fireResponseConfetti(): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const end = Date.now() + 2200;

  confetti({
    particleCount: 80,
    spread: 72,
    origin: { y: 0.55 },
    colors: NCI_COLORS,
    disableForReducedMotion: true,
  });

  const burst = () => {
    confetti({
      particleCount: 2,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.65 },
      colors: NCI_COLORS,
      disableForReducedMotion: true,
    });
    confetti({
      particleCount: 2,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.65 },
      colors: NCI_COLORS,
      disableForReducedMotion: true,
    });
    if (Date.now() < end) requestAnimationFrame(burst);
  };

  burst();
}
