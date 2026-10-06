import { supabase } from "../supabase";

export async function logCost(service: string, operation: string, units: number, unitCost: number, purpose?: string, companyId?: string) {
  await supabase.from("usage_costs").insert({ service, operation, units, unit_cost: unitCost, purpose, company_id: companyId ?? null });
}