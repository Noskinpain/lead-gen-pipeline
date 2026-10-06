import { scoreIntent } from "./score-intent";

const testCompany = {
  id: "test-1",
  company_name: "Test Co",
  industry: "Software",
  location: "Lagos",
  employee_count: 50,
  enriched_industry: "B2B Software",
  business_model: "B2B",
  customer_type: "Small businesses",
  meta_description: "We're hiring! Join our growing team building workflow automation tools.",
  body_text_sample: "We're hiring! Check out our latest case study and blog for updates on our expanding platform.",
    classification_confidence: 0.85,
};

console.log(scoreIntent(testCompany));