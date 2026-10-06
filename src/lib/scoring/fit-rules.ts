import { ScoringRule } from "./types";

const TARGET_INDUSTRIES = ["software", "technology", "saas", "professional services", "e-commerce", "agency", "consulting", "fintech", "financial technology", "payments"];

export const fitRules: ScoringRule[] = [
  {
    name: "target_industry",
    category: "fit",
    points: 25,
    evaluate: (c) => {
      const industry = (c.enriched_industry ?? c.industry ?? "").toLowerCase();
      return TARGET_INDUSTRIES.some((target) => industry.includes(target));
    },
  },
  {
    name: "b2b_business_model",
    category: "fit",
    points: 15,
    evaluate: (c) => c.business_model === "B2B" || c.business_model === "B2B2C",
  },
  {
    name: "company_size_in_range",
    category: "fit",
    points: 15,
    evaluate: (c) => c.employee_count !== null && c.employee_count >= 10 && c.employee_count <= 200,
  },
  {
    name: "has_customer_type_signal",
    category: "fit",
    points: 15,
    // Having ANY classified customer type at all is itself a weak fit signal —
    // it means the LLM found enough text to classify something meaningful.
    evaluate: (c) => c.customer_type !== null && c.customer_type.trim().length > 0,
  },
  {
    name: "relevant_service_keywords",
    category: "fit",
    points: 15,
    evaluate: (c) => {
      const text = (c.body_text_sample ?? "").toLowerCase();
      const keywords = ["automation", "workflow", "crm", "sales", "operations", "platform", "software"];
      return keywords.some((kw) => text.includes(kw));
    },
  },
  {
    name: "location_known",
    category: "fit",
    points: 10,
    // Weak signal today since we have no real geography constraint —
    // just rewards having ANY location data at all, i.e. a more complete record.
    evaluate: (c) => c.location !== null && c.location.trim().length > 0 && c.location !== "Unknown",
  },
]; 