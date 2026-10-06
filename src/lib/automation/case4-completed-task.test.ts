import { supabase } from "../supabase";
import { createTasksFromReplyEvent } from "./create-task-from-event";

async function main() {
  const opportunityId = "3fc2ddd1-fa7a-4c9f-a65e-53f1351a6d03";

  // Mark the existing task from Step 4 as completed
  await supabase.from("tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("source_event_id", "evt_test_001:high_confidence_interested");

  // Now replay the SAME event again — does completing it open the door
  // to a duplicate, or does the unique constraint still hold regardless
  // of status?
  const context = {
    opportunityId, opportunityStage: "replied", daysSinceLastEvent: 0,
    replyClassification: { intent: "interested", confidence: 0.9 },
  };
  const result = await createTasksFromReplyEvent("evt_test_001", opportunityId, context);
  console.log("Replay after completion:", result);

  const { count } = await supabase.from("tasks").select("*", { count: "exact", head: true }).eq("source_event_id", "evt_test_001:high_confidence_interested");
  console.log("Task count for this event:", count);
}

main();