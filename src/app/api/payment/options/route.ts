import { NextResponse } from "next/server";

/** Aligné voting-indgo — ici toujours actif pour la démo VoteMinimal */
export function GET() {
  return NextResponse.json({
    paymentActive: true,
    votesClosed: false,
    dvPassActive: false,
  });
}
