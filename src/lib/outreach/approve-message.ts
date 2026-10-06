import { supabase } from "../supabase";
import { assertTransition, MessageStatus } from "./state-machine";
import { logger } from "../logger";

export async function approveMessage(messageId: string) {
  const { data: message } = await supabase
    .from("outreach_messages")
    .select("status, quality_check_passed")
    .eq("id", messageId)
    .single();

  if (!message) throw new Error("Message not found");

  // A human can still choose to override and approve a failed-quality
  // draft (they might disagree with the automated check) — but this
  // should be a conscious, logged decision, not silent.
  if (!message.quality_check_passed) {
    logger.warn("Approving a message that failed the quality gate", { messageId });
  }

  assertTransition(message.status as MessageStatus, "APPROVED");

  await supabase.from("outreach_messages").update({ status: "APPROVED" }).eq("id", messageId);
  logger.info("Message approved", { messageId });
}