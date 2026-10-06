import { supabase } from "../supabase";

export interface OutcomeRow {
  companyId: string;
  companyName: string;
  fitScore: number | null;
  intentScore: number | null;
  contactScore: number | null;
  replied: boolean;
  meetingBooked: boolean;
  won: boolean;
  revenue: number | null;
}

export async function buildOutcomeDataset(): Promise<OutcomeRow[]> {
  const { data: companies } = await supabase.from("companies").select("id, company_name");
  if (!companies) return [];

  const rows: OutcomeRow[] = [];

  for (const company of companies) {
    const { data: score } = await supabase
      .from("lead_scores")
      .select("fit_score, intent_score")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: contact } = await supabase
      .from("contacts")
      .select("contact_score")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: message } = await supabase
      .from("outreach_messages")
      .select("status")
      .eq("company_id", company.id)
      .limit(1)
      .maybeSingle();

    const { data: opportunity } = await supabase
      .from("opportunities")
      .select("stage, actual_value, estimated_value")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: hasMeetingTask } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("opportunity_id", opportunity ? (await supabase.from("opportunities").select("id").eq("company_id", company.id).limit(1).maybeSingle()).data?.id : null)
      .eq("type", "schedule_meeting");

    rows.push({
      companyId: company.id,
      companyName: company.company_name,
      fitScore: score?.fit_score ?? null,
      intentScore: score?.intent_score ?? null,
      contactScore: contact?.contact_score ?? null,
      replied: message?.status === "REPLIED" || opportunity?.stage === "replied" || opportunity?.stage === "interested" || opportunity?.stage === "won",
      meetingBooked: (hasMeetingTask ?? 0) > 0,
      won: opportunity?.stage === "won",
      revenue: opportunity?.actual_value ?? opportunity?.estimated_value ?? null,
    });
  }

  return rows;
}