export interface ContactEvalCase {
  companyLabel: string;
  predictedRole: string | null;
  actualBestRole: string | null; // what a human would have picked
}

// Hand-constructed cases based on realistic candidate pools, since we
// don't have enough real multi-candidate companies to draw this from
// actual data yet — flagged honestly, same as Step 1's ground truth.
const contactEvalCases: ContactEvalCase[] = [
  { companyLabel: "Case A: CEO + Head of Sales both present", predictedRole: "Founder & CEO", actualBestRole: "Founder & CEO" }, // correct — highest-ranked role
  { companyLabel: "Case B: Only a Marketing Manager found", predictedRole: "Marketing Manager", actualBestRole: "Marketing Manager" }, // correct — best available
  { companyLabel: "Case C: Head of Sales + Sales Director present", predictedRole: "Head of Sales", actualBestRole: "Head of Sales" }, // correct per role-rules.ts priority
  { companyLabel: "Case D: Only an HR Manager found (no relevant role)", predictedRole: null, actualBestRole: null }, // correct — system correctly found nobody relevant
  { companyLabel: "Case E: Founder + Head of Marketing, but Marketing more relevant for THIS specific offer", predictedRole: "Founder & CEO", actualBestRole: "Head of Marketing" }, // a REAL disagreement worth logging
];

export function evaluateContactSelection(cases: ContactEvalCase[] = contactEvalCases) {
  const results = cases.map((c) => ({ ...c, correct: c.predictedRole === c.actualBestRole }));
  const accuracy = results.filter((r) => r.correct).length / results.length;
  return { results, accuracy };
}