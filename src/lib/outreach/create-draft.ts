import { supabase } from "../supabase";
import { buildOutreachContext } from "./build-context";
import { generateMessage } from "./generate-message";
import { runQualityGate } from "./quality-gate";
import { logger } from "../logger";

export async function createOutreachDraft(campaignId: string, companyId: string, contactId: string) {
  // Do-not-contact is checked FIRST, before spending an LLM call on a draft
  // that must never be sent.
  const { data: contact } = await supabase
    .from("contacts")
    .select("email, email_status, do_not_contact, do_not_contact_reason")
    .eq("id", contactId)
    .single();

  if (contact?.do_not_contact) {
    logger.warn("Draft blocked: contact is marked do not contact", { companyId, contactId });
    return {
      status: "blocked" as const,
      reason: `Contact is marked do not contact${contact.do_not_contact_reason ? ` (${contact.do_not_contact_reason})` : ""}.`,
    };
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

  const message = await generateMessage(context);
  if (!message) {
    logger.warn("LLM message generation failed or was invalid", { companyId, contactId });
    return { status: "failed" as const, reason: "Message generation failed" };
  }

  // The contact is not do-not-contact at this point (blocked above), so the
  // gate's "unsubscribed" input is genuinely false now, not assumed.
  const quality = runQualityGate(message, context, contact?.email ?? null, alreadyContacted, false);

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
      quality_check_passed: quality.passed,
      quality_issues: quality.issues,
      status: "DRAFT",
    })
    .select("id")
    .single();

  if (error || !saved) {
    logger.error("Failed to save draft", { companyId, contactId, error: error?.message });
    return { status: "failed" as const, reason: error?.message };
  }

  logger.info("Draft created", { messageId: saved.id, qualityPassed: quality.passed, issueCount: quality.issues.length });

  return { status: "drafted" as const, messageId: saved.id, qualityPassed: quality.passed, issues: quality.issues };
}