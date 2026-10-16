import { supabase } from "../supabase";
import { sendEmail } from "./send-email";
import { assertTransition, MessageStatus } from "./state-machine";
import { logger } from "../logger";
import { syncOpportunityFromOutreach } from "../crm/sync-from-outreach";
import { checkContactable } from "../compliance/contactable";
import { getSenderIdentity } from "../compliance/sender-identity";
import { createUnsubscribeToken } from "../compliance/unsubscribe-token";
import { buildFooter, unsubscribeUrlFor } from "../compliance/footer";

export async function sendMessage(messageId: string) {
  const { data: message } = await supabase
    .from("outreach_messages")
    .select("status, subject, body, contact_id, company_id")
    .eq("id", messageId)
    .single();

  if (!message) throw new Error("Message not found");

  // Last line of defense: whatever path got a message here (the CRM, a script,
  // n8n), a contact who may not be emailed is never sent to.
  const contactable = await checkContactable(message.contact_id, { realSend: false });
  if (!contactable.ok) {
    logger.warn("Send blocked by compliance check", { messageId, kind: contactable.kind });
    return { status: "blocked" as const, reason: `Not sent: ${contactable.reason}` };
  }

  const sender = getSenderIdentity();
  if (!sender.ok) {
    return {
      status: "blocked" as const,
      reason: `Not sent: the sender identity is incomplete (missing ${sender.missing.join(", ")}).`,
    };
  }

  assertTransition(message.status as MessageStatus, "SENT");

  // Sender identity, where the details came from, the privacy notice and the
  // unsubscribe link go on every email, added here so they can't be edited out.
  const unsubscribeUrl = unsubscribeUrlFor(sender.identity.baseUrl, createUnsubscribeToken(messageId));
  const footer = buildFooter(sender.identity, unsubscribeUrl, contactable.collectedFrom);

  const result = await sendEmail(message.subject, `${message.body}\n${footer}`, contactable.email, {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });

  if (!result.success) {
    logger.error("Send failed", { messageId, error: result.error });
    return { status: "failed" as const, error: result.error };
  }

  await supabase
    .from("outreach_messages")
    .update({ status: "SENT", sent_at: new Date().toISOString(), provider_message_id: result.providerMessageId })
    .eq("id", messageId);

  await supabase
    .from("outreach_events")
    .insert({ message_id: messageId, event_type: "sent", event_data: { provider_message_id: result.providerMessageId } });

  // Sync to CRM: a sent message should create or advance an opportunity
  await syncOpportunityFromOutreach(message.company_id, message.contact_id);

  logger.info("Message sent", { messageId, providerMessageId: result.providerMessageId });
  return { status: "sent" as const, providerMessageId: result.providerMessageId };
}