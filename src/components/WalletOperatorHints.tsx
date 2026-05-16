"use client";

const hintBox =
  "rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[11px] leading-relaxed text-zinc-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200";

export function WalletOperatorHints({
  walletId,
  dvPassActive,
}: {
  walletId: string;
  dvPassActive: boolean;
}) {
  switch (walletId) {
    case "orange_ci":
      return (
        <div className={hintBox}>
          <p className="mb-1.5 font-semibold text-zinc-900 dark:text-white">Orange Money</p>
          <ul className="list-disc space-y-1 pl-4 text-zinc-600 dark:text-gray-300">
            <li>
              Pour obtenir le <strong className="text-zinc-900 dark:text-gray-100">code OTP (4 chiffres)</strong>,
              composez sur votre téléphone :{" "}
              <span className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-900 dark:bg-black/40 dark:text-white">
                #144*82#
              </span>
            </li>
            <li>Entrez ce code dans le champ « Code OTP » ci-dessous.</li>
            {dvPassActive && (
              <li className="text-zinc-500 dark:text-gray-400">
                Avec le paiement en ligne activé, le code peut aussi être demandé par l&apos;opérateur (SMS / écran de
                validation).
              </li>
            )}
          </ul>
        </div>
      );
    case "mtn_ci":
      return (
        <div className={hintBox}>
          <p className="mb-1.5 font-semibold text-zinc-900 dark:text-white">MTN Mobile Money</p>
          <p className="text-zinc-600 dark:text-gray-300">
            Utilisez <strong className="text-zinc-900 dark:text-gray-100">votre numéro MTN MoMo</strong>. Après
            confirmation, une demande peut s&apos;afficher sur votre téléphone (notification, SMS ou menu USSD / Push) :{" "}
            <strong className="text-zinc-900 dark:text-gray-100">
              validez avec votre code secret MTN sur l&apos;appareil
            </strong>
            .
          </p>
          {dvPassActive && (
            <p className="mt-2 text-zinc-500 dark:text-gray-400">
              Aucun code à saisir sur cette page : la validation se fait sur votre téléphone. Patientez jusqu&apos;à
              la confirmation du paiement.
            </p>
          )}
        </div>
      );
    case "moov_ci":
      return (
        <div className={hintBox}>
          <p className="mb-1.5 font-semibold text-zinc-900 dark:text-white">Moov Money</p>
          <p className="text-zinc-600 dark:text-gray-300">
            Indiquez le <strong className="text-zinc-900 dark:text-gray-100">numéro Moov</strong> utilisé pour payer.
            Surveillez l&apos;invite USSD ou Push : confirmez avec votre{" "}
            <strong className="text-zinc-900 dark:text-gray-100">code secret Moov sur le téléphone</strong>.
          </p>
          {dvPassActive && (
            <p className="mt-2 text-zinc-500 dark:text-gray-400">
              Aucun code sur cette page : la confirmation se fait sur votre téléphone. Patientez jusqu&apos;à la
              confirmation du paiement.
            </p>
          )}
        </div>
      );
    case "wave_ci":
      return dvPassActive ? (
        <div className={hintBox}>
          <p className="mb-1.5 font-semibold text-zinc-900 dark:text-white">Wave</p>
          <p className="text-zinc-600 dark:text-gray-300">
            Après confirmation, une{" "}
            <strong className="text-zinc-900 dark:text-gray-100">fenêtre ou l&apos;application Wave</strong>{" "}
            s&apos;ouvre pour finaliser le paiement. Aucun code OTP n&apos;est demandé sur cette page.
          </p>
        </div>
      ) : null;
    default:
      return null;
  }
}
