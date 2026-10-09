import { supabase } from "../supabase";
import { fetchWebsiteEnrichment } from "./website-source";
import { classifyCompanyText } from "./llm-classify";
import { isStale } from "./freshness";
import { logger } from "../logger";

export interface EnrichmentResult {
  companyId: string;
  status: "enriched" | "failed" | "skipped_no_domain" | "skipped_fresh";
  fieldsAdded: number;
  error?: string;
}

export async function enrichCompany(companyId: string): Promise<EnrichmentResult> {
  // 1. Load the company
  const { data: company, error: fetchError } = await supabase
    .from("companies")
    .select("id, domain")
    .eq("id", companyId)
    .single();

  if (fetchError || !company) {
    return { companyId, status: "failed", fieldsAdded: 0, error: "Company not found" };
  }

  if (!company.domain) {
    logger.info("Skipping enrichment: no domain", { companyId });
    return { companyId, status: "skipped_no_domain", fieldsAdded: 0 };
  }

  // 2. Cache check: skip the fetch if all existing website facts are still fresh
  const { data: existingFacts } = await supabase
    .from("company_enrichments")
    .select("field_name, observed_at")
    .eq("company_id", companyId)
    .eq("source", "website_scrape");

  const hasFreshData =
    existingFacts &&
    existingFacts.length > 0 &&
    existingFacts.every((fact) => !isStale(fact.observed_at, fact.field_name));

  if (hasFreshData) {
    logger.info("Skipping enrichment: existing data still fresh", { companyId });
    return { companyId, status: "skipped_fresh", fieldsAdded: 0 };
  }

  // 3. Fetch raw enrichment data from the website
  let raw;
  try {
    raw = await fetchWebsiteEnrichment(company.domain);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    logger.error("Enrichment fetch failed", { companyId, domain: company.domain, error: errorMessage });
    return { companyId, status: "failed", fieldsAdded: 0, error: errorMessage };
  }

  // 4. Build rows, only for fields that actually came back
  const now = new Date().toISOString();
  const rows: Array<{ company_id: string; field_name: string; field_value: string; source: string; observed_at: string }> = [];

  if (raw.title) {
    rows.push({ company_id: companyId, field_name: "website_title", field_value: raw.title, source: "website_scrape", observed_at: now });
  }
  if (raw.metaDescription) {
    rows.push({ company_id: companyId, field_name: "meta_description", field_value: raw.metaDescription, source: "website_scrape", observed_at: now });
  }
  if (raw.bodyTextSample) {
    rows.push({ company_id: companyId, field_name: "body_text_sample", field_value: raw.bodyTextSample, source: "website_scrape", observed_at: now });
  }

  // The "nothing usable" check runs BEFORE the contact signals row is added.
  // That field is always present, so adding it first would make an
  // unparseable page look like a successful enrichment.
  if (rows.length === 0) {
    logger.info("Enrichment fetched but nothing usable found", { companyId, domain: company.domain });
    return { companyId, status: "failed", fieldsAdded: 0, error: "No usable data extracted" };
  }

  rows.push({
    company_id: companyId,
    field_name: "contact_signals",
    field_value: raw.contactSignals.length > 0 ? raw.contactSignals.join(",") : "none",
    source: "website_scrape",
    observed_at: now,
  });

  // 5. Store the website facts
  const { error: insertError } = await supabase.from("company_enrichments").insert(rows);

  if (insertError) {
    logger.error("Enrichment insert failed", { companyId, error: insertError.message });
    return { companyId, status: "failed", fieldsAdded: 0, error: insertError.message };
  }

  // 6. LLM classification, only if there is body text to classify
  let classificationFieldsAdded = 0;

  if (raw.bodyTextSample) {
    const classification = await classifyCompanyText(raw.bodyTextSample);

    if (classification) {
      await supabase.from("company_enrichments").insert([
        { company_id: companyId, field_name: "industry", field_value: classification.industry, source: "llm_classification", confidence: classification.confidence, observed_at: now },
        { company_id: companyId, field_name: "business_model", field_value: classification.business_model, source: "llm_classification", confidence: classification.confidence, observed_at: now },
        { company_id: companyId, field_name: "customer_type", field_value: classification.customer_type.join(", "), source: "llm_classification", confidence: classification.confidence, observed_at: now },
      ]);
      classificationFieldsAdded = 3;
    } else {
      logger.warn("LLM classification failed or was invalid — skipping", { companyId });
    }
  }

  const totalFields = rows.length + classificationFieldsAdded;
  logger.info("Enrichment stored", { companyId, fieldsAdded: totalFields });
  return { companyId, status: "enriched", fieldsAdded: totalFields };
}