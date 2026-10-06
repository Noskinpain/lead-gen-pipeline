import { supabase } from "../supabase";
import { sendEmail } from "./send-email";
import { assertTransition, MessageStatus } from "./state-machine";
import { logger } from "../logger";
import { syncOpportunityFromOutreach } from "../crm/sync-from-outreach";

export async function sendMessage(messageId: string) {
  const { data: message } = await supabase
    .from("outreach_messages")
    .select("status, subject, body, contact_id, company_id")
    .eq("id", messageId)
    .single();

  if (!message) throw new Error("Message not found");

  assertTransition(message.status as MessageStatus, "SENT");

  const { data: contact } = await supabase.from("contacts").select("email").eq("id", message.contact_id).single();

  const result = await sendEmail(message.subject, message.body, contact?.email ?? "");

  if (!result.success) {
    logger.error("Send failed", { messageId, error: result.error });
    return { status: "failed" as const, error: result.error };
  }

  await supabase
    .from("outreach_messages")
    .update({ status: "SENT", sent_at: new Date().toISOString(), provider_message_id: result.providerMessageId })
    .eq("id", messageId);

  await supabase.from("outreach_events").insert({ message_id: messageId, event_type: "sent", event_data: { provider_message_id: result.providerMessageId } });

    // Sync to CRM — a sent message should create or advance an opportunity
  await syncOpportunityFromOutreach(message.company_id, message.contact_id);

  logger.info("Message sent", { messageId, providerMessageId: result.providerMessageId });
  return { status: "sent" as const, providerMessageId: result.providerMessageId };
}