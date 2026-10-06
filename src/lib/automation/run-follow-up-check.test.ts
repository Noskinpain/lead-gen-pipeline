import { runFollowUpCheck } from "./run-follow-up-check";
import { supabase } from "../supabase";

async function main() {
  const opportunityId = "3fc2ddd1-fa7a-4c9f-a65e-53f1351a6d03"; // currently "lost" from Day 7's unsubscribe test

  // Case 1: opportunity is NOT at "contacted" (it's "lost") — should skip
  const result1 = await runFollowUpCheck(opportunityId);
  console.log("Lost opportunity:", result1);

  // Case 2: manually set it back to "contacted" with an old updated_at,
  // simulating "3+ days since contact, still waiting"
  await supabase.from("opportunities").update({
    stage: "contacted",
    updated_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
  }).eq("id", opportunityId);

  const result2 = await runFollowUpCheck(opportunityId);
  console.log("4 days since contact:", result2);

  // Case 3: THE KEY TEST — simulate a reply arriving between scheduling
  // and this check running, by changing stage to "replied" right before checking
  await supabase.from("opportunities").update({ stage: "replied" }).eq("id", opportunityId);

  const result3 = await runFollowUpCheck(opportunityId);
  console.log("Replied just before check ran:", result3);
}

main();