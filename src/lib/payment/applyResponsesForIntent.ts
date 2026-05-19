import type { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Marque l'intent complété et crédite poll_choices une seule fois (votes_credited).
 */
export async function applyResponsesForIntent(
  correlationId: string,
  supabase: ReturnType<typeof getSupabaseAdmin>,
  providerOperationId?: string | null
) {
  const { data: intent, error: fetchErr } = await supabase
    .from("payment_intents")
    .select("campaign_id, choice_id, nb_votes, status, votes_credited")
    .eq("correlation_id", correlationId)
    .maybeSingle();

  if (fetchErr || !intent) {
    console.error("apply responses fetch intent:", fetchErr);
    return;
  }

  if (intent.votes_credited === true) {
    return;
  }

  const choiceId = intent.choice_id;
  const campaignId = intent.campaign_id;
  const add = intent.nb_votes ?? 0;
  if (!choiceId || !campaignId || add < 1) return;

  if (String(intent.status).toLowerCase() !== "completed") {
    const { error: completeErr } = await supabase
      .from("payment_intents")
      .update({
        status: "completed",
        provider_operation_id: providerOperationId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("correlation_id", correlationId);

    if (completeErr) {
      console.error("payment complete update:", completeErr);
      return;
    }
  }

  const { data: locked, error: lockErr } = await supabase
    .from("payment_intents")
    .update({
      votes_credited: true,
      updated_at: new Date().toISOString(),
    })
    .eq("correlation_id", correlationId)
    .eq("votes_credited", false)
    .select("id")
    .maybeSingle();

  if (lockErr || !locked) {
    return;
  }

  const { data: choiceRow, error: choiceErr } = await supabase
    .from("poll_choices")
    .select("id, response_count, campaign_id")
    .eq("campaign_id", campaignId)
    .eq("id", choiceId)
    .maybeSingle();

  if (choiceErr || !choiceRow) {
    console.error("apply responses choice lookup:", choiceErr);
    await supabase
      .from("payment_intents")
      .update({ votes_credited: false })
      .eq("correlation_id", correlationId);
    return;
  }

  const { error: incErr } = await supabase
    .from("poll_choices")
    .update({
      response_count: (choiceRow.response_count ?? 0) + add,
      updated_at: new Date().toISOString(),
    })
    .eq("campaign_id", campaignId)
    .eq("id", choiceRow.id);

  if (incErr) {
    console.error("apply responses increment:", incErr);
    await supabase
      .from("payment_intents")
      .update({ votes_credited: false })
      .eq("correlation_id", correlationId);
  }
}
