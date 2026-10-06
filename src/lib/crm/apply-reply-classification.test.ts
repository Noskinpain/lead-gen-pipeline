import { applyReplyClassification } from "./apply-reply-classification";

async function main() {
  const opportunityId = "3fc2ddd1-fa7a-4c9f-a65e-53f1351a6d03"; // from Step 3

  const result1 = await applyReplyClassification(opportunityId, {
    intent: "interested", confidence: 0.95, requires_human_action: true, reason: "Asked for pricing",
  });
  console.log("High-confidence interested:", result1);
}

main();