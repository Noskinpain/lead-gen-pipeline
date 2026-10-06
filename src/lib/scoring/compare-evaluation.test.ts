import { scoreRealCompany } from "./score-real-company";
import { evaluationDataset } from "./evaluation-dataset";

async function main() {
  for (const entry of evaluationDataset) {
    const result = await scoreRealCompany(entry.companyId);
    console.log(`\n--- ${entry.companyName} ---`);
    console.log("Human judgment:", { fit: entry.humanFit, intent: entry.humanIntent, worthContacting: entry.humanWorthContacting });
    console.log("Formula result:", result ? { fitScore: result.fitScore, intentScore: result.intentScore, priority: result.priority } : "null");
  }
}

main();