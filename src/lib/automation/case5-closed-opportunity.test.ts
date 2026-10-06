import { supabase } from "../supabase";
import { runFollowUpCheck } from "./run-follow-up-check";

async function main() {
  const opportunityId = "3fc2ddd1-fa7a-4c9f-a65e-53f1351a6d03";

  // Set to WON with an old updated_at (should still never trigger follow-up)
  await supabase.from("opportunities").update({
    stage: "won",
    updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
  }).eq("id", opportunityId);

  const result = await runFollowUpCheck(opportunityId);
  console.log("WON opportunity, 10 days old:", result);
}

main();