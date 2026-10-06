import { createTasksFromReplyEvent } from "./create-task-from-event";

async function main() {
  const opportunityId = "3fc2ddd1-fa7a-4c9f-a65e-53f1351a6d03";
  const context = {
    opportunityId, opportunityStage: "replied", daysSinceLastEvent: 0,
    replyClassification: { intent: "interested", confidence: 0.9 },
  };

  // First delivery of the webhook event
  console.log("First delivery:", await createTasksFromReplyEvent("evt_test_001", opportunityId, context));

  // SAME event delivered again (simulating a webhook retry) — should NOT create a duplicate task
  console.log("Duplicate delivery:", await createTasksFromReplyEvent("evt_test_001", opportunityId, context));
}

main();