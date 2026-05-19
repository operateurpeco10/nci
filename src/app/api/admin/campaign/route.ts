import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import {
  archiveActiveAndStartNewCampaign,
  getActiveCampaign,
  getCampaignChoices,
} from "@/lib/campaigns";
import { mapPollChoicesFromDb } from "@/lib/pollChoices";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { readTruthyEnvVar } from "@/lib/readTruthyEnvVar";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAdminUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const campaign = await getActiveCampaign();
  if (!campaign) {
    return NextResponse.json({ error: "Aucune campagne active" }, { status: 404 });
  }

  const rows = await getCampaignChoices(campaign.id);

  return NextResponse.json({
    campaignId: campaign.id,
    questionText: campaign.question_text,
    votesClosed: campaign.votes_closed === true,
    votesClosedEnv: readTruthyEnvVar("VOTES_CLOSED"),
    startedAt: campaign.started_at,
    updatedAt: campaign.updated_at,
    choices: mapPollChoicesFromDb(
      rows.map((r) => ({
        id: r.id as string,
        label: r.label as string,
        response_count: r.response_count,
      }))
    ),
  });
}

type ChoicePatch = { id: string; label: string };

export async function PATCH(request: Request) {
  const user = await getAdminUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: {
    questionText?: string;
    votesClosed?: boolean;
    choices?: ChoicePatch[];
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const campaign = await getActiveCampaign();
  if (!campaign) {
    return NextResponse.json({ error: "Aucune campagne active" }, { status: 404 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  if (typeof body.questionText === "string" || typeof body.votesClosed === "boolean") {
    const patch: Record<string, unknown> = { updated_at: now };
    if (typeof body.questionText === "string") {
      patch.question_text = body.questionText.trim().slice(0, 500);
    }
    if (typeof body.votesClosed === "boolean") {
      patch.votes_closed = body.votesClosed;
    }

    const { error } = await admin
      .from("campaigns")
      .update(patch)
      .eq("id", campaign.id);

    if (error) {
      console.error("admin campaign patch:", error);
      return NextResponse.json({ error: "Mise à jour impossible" }, { status: 500 });
    }
  }

  if (Array.isArray(body.choices)) {
    for (const c of body.choices) {
      if (!c?.id || typeof c.label !== "string") continue;
      const label = c.label.trim().slice(0, 120);
      if (!label) continue;

      const { error } = await admin
        .from("poll_choices")
        .update({ label, updated_at: now })
        .eq("campaign_id", campaign.id)
        .eq("id", c.id);

      if (error) {
        console.error("admin campaign patch choice:", c.id, error);
        return NextResponse.json(
          { error: `Mise à jour du choix impossible` },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({ success: true });
}

/** Clôture la campagne active et en démarre une nouvelle */
export async function POST(request: Request) {
  const user = await getAdminUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: { questionText?: string; copyLabels?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  try {
    const newId = await archiveActiveAndStartNewCampaign({
      questionText: body.questionText,
      copyLabelsFromPrevious: body.copyLabels === true,
    });
    return NextResponse.json({ success: true, campaignId: newId });
  } catch (e) {
    console.error("admin campaign rotate:", e);
    return NextResponse.json(
      { error: "Impossible de démarrer une nouvelle campagne" },
      { status: 500 }
    );
  }
}
