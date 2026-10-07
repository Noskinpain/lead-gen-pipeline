import { supabase } from "../supabase";
import { buildOutreachContext } from "./build-context";
import { generateMessage } from "./generate-message";
import { runQualityGate } from "./quality-gate";
import { logger } from "../logger";

export async function createOutreachDraft(campaignId: string, companyId: string, contactId: string) {
  const context = await buildOutreachContext(companyId, contactId);
  if (!context) {
    logger.warn("Cannot create draft — missing company or contact", { companyId, contactId });
    return { status: "failed" as const, reason: "Missing company or contact data" };
  }

  const { data: contact } = await supabase
    .from("contacts")
    .select("email, email_status")
    .eq("id", contactId)
    .single();

  const { data: existingMessages } = await supabase
    .from("outreach_messages")
    .select("id, status, campaign_id")
    .eq("contact_id", contactId);

  // Idempotency: don't create duplicate drafts for the same campaign + contact
  const existingDraft = existingMessages?.find(
    (m) => m.campaign_id === campaignId && m.status === "DRAFT"
  );
  if (existingDraft) {
    logger.info("Draft already exists for campaign and contact", { campaignId, contactId, draftId: existingDraft.id });
    return { status: "drafted" as const, messageId: existingDraft.id, qualityPassed: true, issues: [] };
  }

  const alreadyContacted = (existingMessages?.length ?? 0) > 0;
  const unsubscribed = existingMessages?.some((m) => m.status === "UNSUBSCRIBED") ?? false;

  const message = await generateMessage(context);
  if (!message) {
    logger.warn("LLM message generation failed or was invalid", { companyId, contactId });
    return { status: "failed" as const, reason: "Message generation failed" };
  }

  const quality = runQualityGate(message, context, contact?.email ?? null, alreadyContacted, unsubscribed);

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