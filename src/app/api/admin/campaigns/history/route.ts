import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAdminUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  const { data: campaigns, error } = await admin
    .from("campaigns")
    .select("id, question_text, votes_closed, status, started_at, ended_at, created_at")
    .order("started_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Lecture impossible" }, { status: 500 });
  }

  const ids = (campaigns ?? []).map((c) => c.id);
  const { data: choiceRows } = await admin
    .from("poll_choices")
    .select("campaign_id, id, label, response_count, slot, display_order")
    .in("campaign_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
    .order("display_order", { ascending: true });

  const choicesByCampaign = new Map<
    string,
    { id: string; label: string; votes: number; slot: string }[]
  >();
  for (const row of choiceRows ?? []) {
    const cid = row.campaign_id as string;
    const list = choicesByCampaign.get(cid) ?? [];
    list.push({
      id: row.id as string,
      label: row.label as string,
      votes: row.response_count ?? 0,
      slot: (row.slot as string) ?? (row.id as string),
    });
    choicesByCampaign.set(cid, list);
  }

  const { data: revenueRows } = await admin
    .from("payment_intents")
    .select("campaign_id, status, amount_fcfa, nb_votes")
    .in("campaign_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const statsByCampaign = new Map<
    string,
    { completedPayments: number; totalRevenueFcfa: number; votesFromPayments: number }
  >();

  for (const cid of ids) {
    statsByCampaign.set(cid, {
      completedPayments: 0,
      totalRevenueFcfa: 0,
      votesFromPayments: 0,
    });
  }

  for (const row of revenueRows ?? []) {
    const cid = row.campaign_id as string;
    const st = statsByCampaign.get(cid);
    if (!st) continue;
    if (String(row.status).toLowerCase() === "completed") {
      st.completedPayments += 1;
      st.totalRevenueFcfa += row.amount_fcfa ?? 0;
      st.votesFromPayments += row.nb_votes ?? 0;
    }
  }

  const items = (campaigns ?? []).map((c) => {
    const cid = c.id as string;
    const choices = choicesByCampaign.get(cid) ?? [];
    const stats = statsByCampaign.get(cid) ?? {
      completedPayments: 0,
      totalRevenueFcfa: 0,
      votesFromPayments: 0,
    };
    return {
      id: cid,
      questionText: c.question_text as string,
      status: c.status as string,
      votesClosed: c.votes_closed === true,
      startedAt: c.started_at as string,
      endedAt: c.ended_at as string | null,
      choices,
      totalVotes: choices.reduce((s, ch) => s + ch.votes, 0),
      ...stats,
    };
  });

  return NextResponse.json({ campaigns: items });
}
