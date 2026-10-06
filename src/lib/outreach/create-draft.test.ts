import { createOutreachDraft } from "./create-draft";
import { approveMessage } from "./approve-message";
import { supabase } from "../supabase";

async function main() {
  const { data: campaign } = await supabase
    .from("outreach_campaigns")
    .insert({ name: "Test Campaign — Day 6" })
    .select("id")
    .single();

  const draft = await createOutreachDraft(
    campaign!.id,
    "53984b17-457f-4ffc-8ace-8af1888562c7", // Catlog
    "9447da65-2633-40bc-900a-11e10f2c15ec"
  );
  console.log("Draft result:", draft);

  if (draft.status === "drafted") {
    await approveMessage(draft.messageId);
    console.log("Approved.");
  }
}

main();