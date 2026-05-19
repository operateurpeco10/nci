import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getAdminUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId")?.trim() || null;

  const admin = getSupabaseAdmin();
  let query = admin
    .from("payment_intents")
    .select(
      "id, correlation_id, campaign_id, choice_id, nb_votes, wallet_id, msisdn, status, amount_fcfa, failure_code, failure_detail, provider_operation_id, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (campaignId) {
    query = query.eq("campaign_id", campaignId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("admin payment_intents:", error);
    return NextResponse.json(
      { error: "Impossible de charger les paiements" },
      { status: 500 }
    );
  }

  const campaignIds = [...new Set((data ?? []).map((r) => r.campaign_id).filter(Boolean))];
  const { data: campaigns } = await admin
    .from("campaigns")
    .select("id, question_text, status")
    .in("id", campaignIds.length ? campaignIds : ["00000000-0000-0000-0000-000000000000"]);

  const questionByCampaign = new Map(
    (campaigns ?? []).map((c) => [c.id as string, c.question_text as string])
  );

  const { data: choices } = await admin
    .from("poll_choices")
    .select("campaign_id, id, label")
    .in("campaign_id", campaignIds.length ? campaignIds : ["00000000-0000-0000-0000-000000000000"]);

  const labelKey = (cid: string, choiceId: string) => `${cid}:${choiceId}`;
  const labelByKey = new Map<string, string>();
  for (const c of choices ?? []) {
    labelByKey.set(
      labelKey(c.campaign_id as string, c.id as string),
      c.label as string
    );
  }

  const rows = (data ?? []).map((row) => {
    const cid = row.campaign_id as string;
    return {
      ...row,
      campaign_question: questionByCampaign.get(cid) ?? null,
      choice_label:
        labelByKey.get(labelKey(cid, row.choice_id as string)) ?? row.choice_id,
    };
  });

  return NextResponse.json({ rows });
}
