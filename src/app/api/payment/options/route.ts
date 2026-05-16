import { NextResponse } from "next/server";

/** Aligné voting-indgo — ici toujours actif pour la démo VoteMinimal */
export function GET() {
  return NextResponse.json({
    paystackActive: true,
    votesClosed: false,
    dvPassActive: false,
  });
}
