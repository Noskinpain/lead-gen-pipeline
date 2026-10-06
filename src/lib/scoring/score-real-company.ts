import { supabase } from "../supabase";
import { scoreCompany } from "./score-company";
import { saveScore } from "./save-score";
import { CompanyForScoring } from "./types";
import { logger } from "../logger";

async function loadCompanyForScoring(companyId: string): Promise<CompanyForScoring | null> {
const { data: company, error: companyError } = await supabase
  .from("companies")
  .select("id, company_name, industry, location, employee_count")
  .eq("id", companyId)
  .single();

if (companyError) {
  console.log("Company query error:", companyError);
}

if (!company) return null;

 const { data: facts, error: factsError } = await supabase
  .from("company_enrichments")
  .select("field_name, field_value, confidence")
  .eq("company_id", companyId);

if (factsError) {
  console.log("Facts query error:", factsError);
}

  const findFact = (name: string) => facts?.find((f) => f.field_name === name) ?? null;

  const industryFact = findFact("industry");
  const businessModelFact = findFact("business_model");
  const customerTypeFact = findFact("customer_type");

  return {
    id: company.id,
    company_name: company.company_name,
    industry: company.industry,
    location: company.location,
    employee_count: company.employee_count,
    enriched_industry: industryFact?.field_value ?? null,
    business_model: businessModelFact?.field_value ?? null,
    customer_type: customerTypeFact?.field_value ?? null,
    // All three LLM-derived facts share one confidence value from the
    // same classification call (Day 3) — using the industry fact's
    // confidence as representative of the whole classification.
    classification_confidence: industryFact?.confidence ?? null,
    meta_description: findFact("meta_description")?.field_value ?? null,
    body_text_sample: findFact("body_text_sample")?.field_value ?? null,
  };
}

export async function scoreRealCompany(companyId: string) {
  const company = await loadCompanyForScoring(companyId);

  if (!company) {
    logger.warn("Cannot score — company not found", { companyId });
    return null;
  }

  const result = scoreCompany(company);
  await saveScore(result);

  logger.info("Company scored", {
    companyId,
    priorityScore: result.priorityScore,
    priority: result.priority,
    needsReview: result.needsReview,
  });

  return result;
}