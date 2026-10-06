import { supabase } from "../supabase";

export interface UnitEconomics {
  totalCost: number;
  qualifiedLeads: number;
  meetings: number;
  customers: number;
  costPerQualifiedLead: number | null;
  costPerMeeting: number | null;
  costPerCustomer: number | null;
}

export async function computeUnitEconomics(): Promise<UnitEconomics> {
  const { data: costs } = await supabase.from("usage_costs").select("total_cost");
  const totalCost = (costs ?? []).reduce((sum, c) => sum + Number(c.total_cost), 0);

  const { count: qualifiedLeads } = await supabase.from("lead_scores").select("*", { count: "exact", head: true }).in("priority", ["HIGH", "MEDIUM", "LOW"]);
  const { count: meetings } = await supabase.from("tasks").select("*", { count: "exact", head: true }).eq("type", "schedule_meeting");
  const { count: customers } = await supabase.from("opportunities").select("*", { count: "exact", head: true }).eq("stage", "won");

  // Same honest-null pattern as every other metric in this build:
  // dividing by zero leads/meetings/customers isn't "free," it's
  // "undefined" — there's no meaningful per-unit cost when the unit
  // count itself is zero.
  return {
    totalCost,
    qualifiedLeads: qualifiedLeads ?? 0,
    meetings: meetings ?? 0,
    customers: customers ?? 0,
    costPerQualifiedLead: qualifiedLeads ? totalCost / qualifiedLeads : null,
    costPerMeeting: meetings ? totalCost / meetings : null,
    costPerCustomer: customers ? totalCost / customers : null,
  };
}