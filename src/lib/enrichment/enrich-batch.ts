import { supabase } from "../supabase";
import { enrichCompany } from "./enrich-company";
import { logger } from "../logger";

// Rough, editable estimate — Gemini 2.0/3.5 Flash Lite free tier costs $0,
// but tracking a "would-be" cost matters once you outgrow the free tier
// or add a paid source later. This number is a placeholder to fill in
// with real pricing once that happens.
const ESTIMATED_COST_PER_LLM_CALL_USD = 0;
const ESTIMATED_COST_PER_WEBSITE_FETCH_USD = 0;

export async function enrichBatch(companyIds: string[]) {
  const { data: run, error: runError } = await supabase
    .from("enrichment_runs")
    .insert({ companies_attempted: companyIds.length })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(`Failed to create enrichment run: ${runError?.message}`);
  }

  const stats = {
    companies_enriched: 0,
    companies_skipped_fresh: 0,
    companies_skipped_no_domain: 0,
    companies_failed: 0,
    fields_added: 0,
    website_fetches: 0,
    llm_calls: 0,
  };

  for (const companyId of companyIds) {
    const result = await enrichCompany(companyId);

    if (result.status === "enriched") {
      stats.companies_enriched++;
      stats.fields_added += result.fieldsAdded;
      stats.website_fetches++; // one fetch attempt per enriched company
      if (result.fieldsAdded > 3) stats.llm_calls++; // classification happened
    } else if (result.status === "skipped_fresh") {
      stats.companies_skipped_fresh++;
    } else if (result.status === "skipped_no_domain") {
      stats.companies_skipped_no_domain++;
    } else {
      stats.companies_failed++;
    }
  }

  const estimatedCost =
    stats.website_fetches * ESTIMATED_COST_PER_WEBSITE_FETCH_USD +
    stats.llm_calls * ESTIMATED_COST_PER_LLM_CALL_USD;

  await supabase
    .from("enrichment_runs")
    .update({
      completed_at: new Date().toISOString(),
      ...stats,
      estimated_cost_usd: estimatedCost,
    })
    .eq("id", run.id);

  logger.info("Enrichment batch completed", { runId: run.id, ...stats, estimated_cost_usd: estimatedCost });

  return { runId: run.id, ...stats, estimated_cost_usd: estimatedCost };
}