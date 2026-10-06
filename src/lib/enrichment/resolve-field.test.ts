import { resolveField } from "./resolve-field";

const facts = [
  { field_value: "Software company", source: "website_scrape", observed_at: "2026-09-10T00:00:00Z", confidence: null },
  { field_value: "B2B SaaS", source: "llm_classification", observed_at: "2026-09-01T00:00:00Z", confidence: 0.88 },
];

console.log(resolveField(facts));
// Expect: the llm_classification one wins, DESPITE being older —
// because source priority beats recency in this design.