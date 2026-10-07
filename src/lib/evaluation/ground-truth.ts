// GROUND TRUTH DATASET
//
// Entries 1-5 are REAL companies, judged by actual human review in Day 4.
// Entries 6-9 are CONSTRUCTED — deliberately invented company profiles,
// not real businesses, added specifically to make precision/recall
// computable today. Day 4's real dataset had zero positive examples
// (every real company was judged "not worth contacting"), which left
// precision and recall mathematically undefined. These constructed
// cases are clearly flagged as such — they prove the EVALUATION
// MECHANISM works correctly, they do not claim anything about real-world
// lead quality the way the Day 4 entries do.

export interface GroundTruthEntry {
  id: string;
  label: string;
  isReal: boolean; // false = constructed test case, not a real company
  fitScore: number; // what the scoring engine would plausibly produce
  intentScore: number;
  humanWorthContacting: boolean;
}

export const groundTruthDataset: GroundTruthEntry[] = [
  // Real, from Day 4 — all correctly judged "no"
  { id: "stripe", label: "Stripe", isReal: true, fitScore: 70, intentScore: 0, humanWorthContacting: false },
  { id: "linear", label: "Linear", isReal: true, fitScore: 55, intentScore: 0, humanWorthContacting: false },
  { id: "salesforce", label: "Salesforce", isReal: true, fitScore: 70, intentScore: 0, humanWorthContacting: false },
  { id: "nike", label: "Nike", isReal: true, fitScore: 15, intentScore: 0, humanWorthContacting: false },
  { id: "catlog", label: "Catlog", isReal: true, fitScore: 70, intentScore: 40, humanWorthContacting: false },

  // Constructed — synthetic profiles built to exercise the full
  // confusion matrix, NOT real companies
  { id: "synthetic_good_1", label: "[Constructed] Small B2B SaaS, actively hiring sales", isReal: false, fitScore: 85, intentScore: 90, humanWorthContacting: true },
  { id: "synthetic_good_2", label: "[Constructed] Mid-size agency, growth language on site", isReal: false, fitScore: 75, intentScore: 70, humanWorthContacting: true },
  { id: "synthetic_bad_1", label: "[Constructed] Local restaurant, no B2B signal", isReal: false, fitScore: 10, intentScore: 5, humanWorthContacting: false },
  { id: "synthetic_edge_1", label: "[Constructed] Good fit, zero intent signal", isReal: false, fitScore: 80, intentScore: 0, humanWorthContacting: true }, // a genuinely hard case, deliberately included
];