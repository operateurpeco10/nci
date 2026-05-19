import { NextResponse } from "next/server";

import { isDvPassConfigured } from "@/lib/dvpass";
import {
  isPaymentBypassAllEnabled,
  isPaymentBypassWaveEnabled,
} from "@/lib/paymentBypass";
import { areVotesClosed } from "@/lib/votesClosed";

export const dynamic = "force-dynamic";

export async function GET() {
  const dvPassActive = isDvPassConfigured();
  const paymentBypassAll = isPaymentBypassAllEnabled();
  const paymentBypassWave = isPaymentBypassWaveEnabled();
  const votesClosed = await areVotesClosed();

  return NextResponse.json(
    {
      paymentActive: dvPassActive || paymentBypassAll || paymentBypassWave,
      dvPassActive,
      paymentBypassAll,
      paymentBypassWave,
      votesClosed,
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    }
  );
}
