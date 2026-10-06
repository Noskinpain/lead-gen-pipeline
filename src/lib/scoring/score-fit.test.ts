import { scoreFit } from "./score-fit";

const testCompany = {
  id: "test-1",
  company_name: "Test Co",
  industry: "Software",
  location: "Lagos",
  employee_count: 50,
  enriched_industry: "B2B Software",
  business_model: "B2B",
  customer_type: "Small businesses",
  body_text_sample: "We provide workflow automation and CRM tools for growing teams.",
  meta_description: "Test company meta description.",
    classification_confidence: 0.85,
};

console.log(scoreFit(testCompany));