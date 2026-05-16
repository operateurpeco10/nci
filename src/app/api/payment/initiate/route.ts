import { NextResponse } from "next/server";

interface PaymentRequest {
  nbVotes?: number;
  packId?: string;
  emailVotant?: string;
  telephoneVotant?: string;
  otpCode?: string;
  paiementVia?: string;
  returnPath?: string;
  locale?: string;
}

/** Démo locale : succès sans URL de redirection (`demo: true`). */
export async function POST(request: Request) {
  let body: PaymentRequest = {};
  try {
    body = (await request.json()) as PaymentRequest;
  } catch {
    /* ignore */
  }

  const raw =
    typeof body.nbVotes === "number" && Number.isFinite(body.nbVotes) && body.nbVotes > 0
      ? Math.floor(body.nbVotes)
      : 1;
  const nbVotes = Math.min(raw, 20);

  return NextResponse.json({
    success: true,
    demo: true,
    nbVotes,
    packId: body.packId ?? null,
    acknowledgedEmail: Boolean(body.emailVotant?.trim()),
    paiementVia: body.paiementVia ?? null,
    hasPhone: Boolean(body.telephoneVotant?.trim()),
    hasOtp: Boolean(body.otpCode?.trim()),
  });
}
