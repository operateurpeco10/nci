import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getActiveCampaign, getCampaignChoices } from "@/lib/campaigns";
import { mapPollChoicesFromDb } from "@/lib/pollChoices";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isVotesClosedEnv } from "@/lib/votesClosed";

export const dynamic = "force-dynamic";

const WALLET_LABELS: Record<string, string> = {
  orange_ci: "Orange Money",
  mtn_ci: "MTN MoMo",
  moov_ci: "Moov Money",
  wave_ci: "Wave",
};

export async function GET() {
  const user = await getAdminUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const campaign = await getActiveCampaign();
  if (!campaign) {
    return NextResponse.json({ error: "Aucune campagne active" }, { status: 404 });
  }

  const choiceRows = await getCampaignChoices(campaign.id);
  const choices = mapPollChoicesFromDb(
    choiceRows.map((r) => ({
      id: r.id as string,
      label: r.label as string,
      response_count: r.response_count,
    }))
  );
  const totalVotes = choices.reduce((s, c) => s + c.votes, 0);

  const admin = getSupabaseAdmin();
  const { data: intents, error: intentErr } = await admin
    .from("payment_intents")
    .select("status, amount_fcfa, wallet_id, nb_votes, created_at")
    .eq("campaign_id", campaign.id);

  if (intentErr) {
    console.error("admin stats intents:", intentErr);
  }

  let completedCount = 0;
  let failedCount = 0;
  let pendingCount = 0;
  let totalRevenueFcfa = 0;
  const walletRevenue: Record<string, number> = {};
  let responsesLast24h = 0;
  const since24h = Date.now() - 24 * 60 * 60 * 1000;

  for (const row of intents ?? []) {
    const st = String(row.status ?? "").toLowerCase();
    if (st === "completed") {
      completedCount += 1;
      totalRevenueFcfa += row.amount_fcfa ?? 0;
      const w = String(row.wallet_id ?? "");
      if (w) walletRevenue[w] = (walletRevenue[w] ?? 0) + (row.amount_fcfa ?? 0);
      const created = new Date(String(row.created_at)).getTime();
      if (Number.isFinite(created) && created >= since24h) {
        responsesLast24h += row.nb_votes ?? 0;
      }
    } else if (st === "failed") {
      failedCount += 1;
    } else if (st === "pending" || st === "processing") {
      pendingCount += 1;
    }
  }

  const walletRevenueList = Object.entries(walletRevenue)
    .map(([walletId, amountFcfa]) => ({
      walletId,
      label: WALLET_LABELS[walletId] ?? walletId,
      amountFcfa,
    }))
    .sort((a, b) => b.amountFcfa - a.amountFcfa);

  return NextResponse.json({
    campaignId: campaign.id,
    questionText: campaign.question_text,
    choices,
    totalVotes,
    totalRevenueFcfa,
    completedPayments: completedCount,
    failedPayments: failedCount,
    pendingPayments: pendingCount,
    responsesLast24h,
    walletRevenue: walletRevenueList,
    votesClosedDb: campaign.votes_closed === true,
    votesClosedEnv: isVotesClosedEnv(),
    startedAt: campaign.started_at,
  });
}
