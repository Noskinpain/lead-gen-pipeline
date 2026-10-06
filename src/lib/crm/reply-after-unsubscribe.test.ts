import { applyReplyClassification } from "./apply-reply-classification";

async function main() {
  const opportunityId = "3fc2ddd1-fa7a-4c9f-a65e-53f1351a6d03"; // currently at "interested" from Step 5

  // First, simulate an unsubscribe
  const unsubResult = await applyReplyClassification(opportunityId, {
    intent: "unsubscribe", confidence: 1, requires_human_action: false, reason: "Asked to be removed",
  });
  console.log("Unsubscribe result:", unsubResult);

  // Now simulate a LATE "interested" reply arriving after the unsubscribe
  // (e.g. a delayed webhook, an old queued message) — should NOT reopen it.
  const lateReplyResult = await applyReplyClassification(opportunityId, {
    intent: "interested", confidence: 0.95, requires_human_action: true, reason: "Late reply",
  });
  console.log("Late reply after unsubscribe:", lateReplyResult);
}

main();

