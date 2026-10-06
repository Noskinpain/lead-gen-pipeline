export interface CompanyForScoring {
  id: string;
  company_name: string;
  industry: string | null;         // from companies table
  location: string | null;
  employee_count: number | null;
  enriched_industry: string | null;    // from LLM classification
  business_model: string | null;       // from LLM classification, e.g. "B2B"
  customer_type: string | null;        // from LLM classification
   meta_description: string | null; // new
  classification_confidence: number | null; // new
  body_text_sample: string | null;     // raw scraped text, for keyword signals
}

export interface ScoringRule {
  name: string;
  category: "fit" | "intent";
  points: number;
  evaluate: (company: CompanyForScoring) => boolean;
}

export interface SignalResult {
  name: string;
  category: "fit" | "intent";
  points: number;
  matched: boolean;
}