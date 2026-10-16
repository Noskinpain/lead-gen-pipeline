import { supabase } from "../supabase";
import { buildOutreachContext } from "./build-context";
import { generateMessage } from "./generate-message";
import { runQualityGate } from "./quality-gate";
import { logger } from "../logger";
import { checkContactable } from "../compliance/contactable";
import { getSenderIdentity } from "../compliance/sender-identity";

export async function createOutreachDraft(campaignId: string, companyId: string, contactId: string) {
  // Checked FIRST, before spending an LLM call on a draft that must never be sent.
  const contactable = await checkContactable(contactId, { realSend: false });
  if (!contactable.ok) {
    logger.warn("Draft blocked by compliance check", { companyId, contactId, kind: contactable.kind });
    return { status: "blocked" as const, reason: contactable.reason };
  }

  const context = await buildOutreachContext(companyId, contactId);
  if (!context) {
    logger.warn("Cannot create draft — missing company or contact", { companyId, contactId });
    return { status: "failed" as const, reason: "Missing company or contact data" };
  }

  // Only emails that actually went out count as "already contacted". A draft
  // still in review, or a rejected one, doesn't.
  const { data: priorSends } = await supabase
    .from("outreach_messages")
    .select("id")
    .eq("contact_id", contactId)
    .not("status", "in", "(DRAFT,APPROVED,SCHEDULED,REJECTED)")
    .limit(1);

  const alreadyContacted = (priorSends?.length ?? 0) > 0;

  const generated = await generateMessage(context);
  if (!generated) {
    logger.warn("LLM message generation failed or was invalid", { companyId, contactId });
    return { status: "failed" as const, reason: "Message generation failed" };
  }

  // Fill in the signature from the sender settings, so a real name is what the
  // reviewer sees instead of [Your Name].
  const sender = getSenderIdentity();
  const message = sender.ok
    ? { ...generated, body: generated.body.replace(/\[Your Name\]/gi, sender.identity.senderName) }
    : generated;

  const gate = runQualityGate(message, context, contactable.email, alreadyContacted, false);
  const issues = [...gate.issues];
  if (!sender.ok) issues.push(`Sender identity is incomplete (missing ${sender.missing.join(", ")}), so this can't be sent yet.`);
  const passed = issues.length === 0;

  const { data: saved, error } = await supabase
    .from("outreach_messages")
    .insert({
      campaign_id: campaignId,
      company_id: companyId,
      contact_id: contactId,
      subject: message.subject,
      body: message.body,
      personalization_used: message.personalization_used,
      claims: message.claims,
      quality_check_passed: passed,
      quality_issues: issues,
      status: "DRAFT",
    })
    .select("id")
    .single();

  if (error || !saved) {
    logger.error("Failed to save draft", { companyId, contactId, error: error?.message });
    return { status: "failed" as const, reason: error?.message };
  }

  logger.info("Draft created", { messageId: saved.id, qualityPassed: passed, issueCount: issues.length });

  return { status: "drafted" as const, messageId: saved.id, qualityPassed: passed, issues };
}