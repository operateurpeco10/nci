import { NextResponse } from "next/server";
import { getActiveCampaign, getCampaignChoices } from "@/lib/campaigns";
import { mapPollChoicesFromDb } from "@/lib/pollChoices";
import { isVotesClosed } from "@/lib/votesClosed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const campaign = await getActiveCampaign();
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Aucune campagne active" },
        { status: 503 }
      );
    }

    const rows = await getCampaignChoices(campaign.id);
    const choices = mapPollChoicesFromDb(
      rows.map((r) => ({
        id: r.id as string,
        label: r.label as string,
        response_count: r.response_count,
      }))
    );

    const votesClosed =
      campaign.votes_closed === true || isVotesClosed();

    return NextResponse.json({
      success: true,
      campaignId: campaign.id,
      question: campaign.question_text,
      votesClosed,
      choices,
    });
  } catch (e) {
    console.error("poll results:", e);
    return NextResponse.json(
      { success: false, error: "Service indisponible" },
      { status: 500 }
    );
  }
}
