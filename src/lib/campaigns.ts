import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type CampaignRow = {
  id: string;
  question_text: string;
  votes_closed: boolean;
  status: "active" | "archived";
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

export const CHOICE_SLOTS = ["a", "b"] as const;
export type ChoiceSlot = (typeof CHOICE_SLOTS)[number];

export async function getActiveCampaign() {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("campaigns")
    .select("*")
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    console.error("getActiveCampaign:", error);
    return null;
  }
  return data as CampaignRow | null;
}

export async function getCampaignChoices(campaignId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("poll_choices")
    .select("id, label, response_count, slot, display_order")
    .eq("campaign_id", campaignId)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("getCampaignChoices:", error);
    return [];
  }
  return data ?? [];
}

/** Vérifie que choiceId est un slot valide pour la campagne active */
export async function resolveChoiceForActiveCampaign(choiceId: string) {
  const campaign = await getActiveCampaign();
  if (!campaign) return null;

  const slot = choiceId.trim().toLowerCase();
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("poll_choices")
    .select("id, label, campaign_id, response_count")
    .eq("campaign_id", campaign.id)
    .eq("id", slot)
    .maybeSingle();

  if (error || !data) return null;
  return { campaign, choice: data };
}

export async function archiveActiveAndStartNewCampaign(options?: {
  questionText?: string;
  copyLabelsFromPrevious?: boolean;
}) {
  const admin = getSupabaseAdmin();
  const active = await getActiveCampaign();
  if (!active) {
    throw new Error("Aucune campagne active");
  }

  const now = new Date().toISOString();

  const { error: archiveErr } = await admin
    .from("campaigns")
    .update({
      status: "archived",
      votes_closed: true,
      ended_at: now,
      updated_at: now,
    })
    .eq("id", active.id);

  if (archiveErr) throw archiveErr;

  const previousChoices = await getCampaignChoices(active.id);
  const questionText =
    options?.questionText?.trim() ||
    "Quelle est la question de la semaine ?";

  const { data: newCampaign, error: createErr } = await admin
    .from("campaigns")
    .insert({
      question_text: questionText.slice(0, 500),
      votes_closed: false,
      status: "active",
      started_at: now,
    })
    .select("id")
    .single();

  if (createErr || !newCampaign) throw createErr ?? new Error("Création campagne");

  const labelsBySlot = Object.fromEntries(
    previousChoices.map((c) => [c.slot ?? c.id, c.label])
  );

  const choiceRows = CHOICE_SLOTS.map((slot, index) => ({
    campaign_id: newCampaign.id,
    id: slot,
    slot,
    label:
      options?.copyLabelsFromPrevious && labelsBySlot[slot]
        ? labelsBySlot[slot]
        : slot === "a"
          ? "Réponse A"
          : "Réponse B",
    response_count: 0,
    display_order: index,
  }));

  const { error: choicesErr } = await admin.from("poll_choices").insert(choiceRows);
  if (choicesErr) throw choicesErr;

  return newCampaign.id as string;
}
