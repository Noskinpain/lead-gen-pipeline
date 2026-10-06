import { scoreCompany } from "./score-company";

const lowConfidenceCompany = {
  id: "test-3", company_name: "Uncertain Co",
  industry: "Software", location: "Lagos", employee_count: 50,
  enriched_industry: "Construction", business_model: "B2C", customer_type: "Homeowners",
  classification_confidence: 0.31, // low — should be discarded
  meta_description: null,
  body_text_sample: "We provide software solutions.",
};

console.log(scoreCompany(lowConfidenceCompany));