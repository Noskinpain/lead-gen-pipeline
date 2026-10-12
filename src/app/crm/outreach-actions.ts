"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { describeZodError, safeReturnTo } from "@/lib/crm/form-helpers";
import { finish, logEvent, type Outcome } from "@/lib/crm/action-helpers";
import { isOpenStage, isStage } from "@/lib/crm/opportunity-state-machine";
import { label } from "@/lib/crm/format";
import { createOutreachDraft } from "@/lib/outreach/create-draft";
import { evaluateDraft } from "@/lib/outreach/evaluate-draft";
import { sendMessage } from "@/lib/outreach/send-message";
import { canTransition, type MessageStatus } from "@/lib/outreach/state-machine";

const CRM_CAMPAIGN_NAME = "CRM drafts";

async function logMessageEvent(messageId: string, eventType: string, data: Record<string, unknown>) {
  const { error } = await supabase
    .from("outreach_events")
    .insert({ message_id: messageId, event_type: eventType, event_data: data });
  if (error) logger.error("Message event failed to save", { messageId, eventType, error: error.message });
}

// ---------- Generate a draft ----------

const GenerateDraftSchema = z.object({ opportunityId: z.uuid() });

type DraftResult = { ok: true; message: string; messageId: string } | { ok: false; error: string };

async function getCrmCampaignId(): Promise<string | null> {
  const { data: existing } = await supabase
    .from("outreach_campaigns")
    .select("id")
    .eq("name", CRM_CAMPAIGN_NAME)
    .limit(1);
  if (existing && existing.length > 0) return existing[0].id;

  const { data: created, error } = await supabase
    .from("outreach_campaigns")
    .insert({ name: CRM_CAMPAIGN_NAME })
    .select("id")
    .single();
  if (error || !created) {
    logger.error("Could not create the CRM campaign", { error: error?.message });
    return null;
  }
  return created.id;
}

async function performGenerateDraft(userId: string, opportunityId: string): Promise<DraftResult> {
  const { data: deal } = await supabase
    .from("opportunities")
    .select("id, stage, company_id, contact_id")
    .eq("id", opportunityId)
    .maybeSingle();

  if (!deal) return { ok: false, error: "Deal not found." };
  if (!isStage(deal.stage) || !isOpenStage(deal.stage)) return { ok: false, error: "This deal is closed." };
  if (!deal.contact_id) return { ok: false, error: "Add a contact to this deal before drafting an email." };

  const { data: active } = await supabase
    .from("outreach_messages")
    .select("id")
    .eq("contact_id", deal.contact_id)
    .in("status", ["DRAFT", "APPROVED"])
    .limit(1);
  if (active && active.length > 0) {
    return { ok: false, error: "This contact already has a draft waiting in the review queue." };
  }

  const campaignId = await getCrmCampaignId();
  if (!campaignId) return { ok: false, error: "Could not set up the drafts campaign." };

  const result = await createOutreachDraft(campaignId, deal.company_id, deal.contact_id);
  if (result.status === "blocked") return { ok: false, error: result.reason };
  if (result.status === "failed") {
    return { ok: false, error: `Could not generate the draft: ${result.reason ?? "unknown error"}` };
  }

  await logEvent(deal.id, userId, "draft_created", { metadata: { message_id: result.messageId } });

  const note = result.qualityPassed
    ? "Draft created. Review it, then approve."
    : `Draft created, with a quality issue: ${result.issues[0] ?? "see below"}`;
  return { ok: true, message: note, messageId: result.messageId };
}

export async function generateDraft(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/crm/outreach");
  const parsed = GenerateDraftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(returnTo, { ok: false, error: describeZodError(parsed.error) });

  const result = await performGenerateDraft(user.id, parsed.data.opportunityId);
  if (!result.ok) finish(returnTo, result);
  finish(`/crm/outreach/${result.messageId}`, result);
}

// ---------- Edit a draft ----------

const normalizeNewlines = (value: unknown) => (typeof value === "string" ? value.replace(/\r\n/g, "\n") : value);

const SaveEditsSchema = z.object({
  messageId: z.uuid(),
  subject: z.string().trim().min(1).max(120),
  body: z.preprocess(normalizeNewlines, z.string().trim().min(1).max(1500)),
});

async function performSaveEdits(userId: string, input: z.infer<typeof SaveEditsSchema>): Promise<Outcome> {
  const { data: draft } = await supabase
    .from("outreach_messages")
    .select("id, status, subject, body, claims, personalization_used, company_id, contact_id")
    .eq("id", input.messageId)
    .maybeSingle();

  if (!draft) return { ok: false, error: "Email not found." };
  if (draft.status !== "DRAFT") return { ok: false, error: "Only drafts can be edited." };
  if (draft.subject === input.subject && draft.body === input.body) return { ok: true, message: "No changes to save." };

  const evaluation = await evaluateDraft({ ...draft, subject: input.subject, body: input.body });
  if (!evaluation) return { ok: false, error: "The company or contact for this email no longer exists." };

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("outreach_messages")
    .update({
      subject: input.subject,
      body: input.body,
      edited_at: now,
      edited_by_id: userId,
      quality_check_passed: evaluation.result.passed,
      quality_issues: evaluation.result.issues,
      updated_at: now,
    })
    .eq("id", input.messageId)
    .eq("status", "DRAFT")
    .select("id");

  if (error) {
    logger.error("saveDraftEdits failed", { error: error.message });
    return { ok: false, error: "Could not save your edits." };
  }
  if (!updated || updated.length === 0) return { ok: false, error: "This email changed while you were editing. Reload it." };

  await logMessageEvent(input.messageId, "edited", { user_id: userId });

  return {
    ok: true,
    message: evaluation.result.passed
      ? "Saved."
      : `Saved. Quality issue: ${evaluation.result.issues[0] ?? "see below"}`,
  };
}

export async function saveDraftEdits(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/crm/outreach");
  const parsed = SaveEditsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(returnTo, { ok: false, error: describeZodError(parsed.error) });
  finish(returnTo, await performSaveEdits(user.id, parsed.data));
}

// ---------- Approve ----------

const ApproveSchema = z.object({ messageId: z.uuid() });

async function performApprove(userId: string, messageId: string, override: boolean): Promise<Outcome> {
  const { data: draft } = await supabase
    .from("outreach_messages")
    .select("id, status, subject, body, claims, personalization_used, company_id, contact_id")
    .eq("id", messageId)
    .maybeSingle();

  if (!draft) return { ok: false, error: "Email not found." };
  if (draft.status !== "DRAFT" || !canTransition("DRAFT", "APPROVED")) {
    return { ok: false, error: "Only drafts can be approved." };
  }

  // Re-check against today's data, not what was true when it was generated.
  const evaluation = await evaluateDraft(draft);
  if (!evaluation) return { ok: false, error: "The company or contact for this email no longer exists." };

  // These two are never overridable.
  if (evaluation.doNotContact) return { ok: false, error: "This contact is marked do not contact. Reject this draft." };
  if (!evaluation.contactEmail) return { ok: false, error: "This contact has no email address." };

  if (!evaluation.result.passed && !override) {
    return {
      ok: false,
      error: `Quality check failed: ${evaluation.result.issues[0] ?? "see the issues"}. Fix it, or tick "approve anyway".`,
    };
  }

  const now = new Date().toISOString();
  const { data: approved, error } = await supabase
    .from("outreach_messages")
    .update({
      status: "APPROVED",
      reviewed_at: now,
      reviewed_by_id: userId,
      quality_check_passed: evaluation.result.passed,
      quality_issues: evaluation.result.issues,
      updated_at: now,
    })
    .eq("id", messageId)
    .eq("status", "DRAFT")
    .select("id");

  if (error) {
    logger.error("approveDraft failed", { error: error.message });
    return { ok: false, error: "Could not approve the email." };
  }
  if (!approved || approved.length === 0) return { ok: false, error: "This email changed. Reload it." };

  await logMessageEvent(messageId, evaluation.result.passed ? "approved" : "approved_with_issues", {
    user_id: userId,
    issues: evaluation.result.issues,
  });

  return { ok: true, message: "Approved. It's ready to send." };
}

export async function approveDraft(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/crm/outreach");
  const parsed = ApproveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(returnTo, { ok: false, error: describeZodError(parsed.error) });
  finish(returnTo, await performApprove(user.id, parsed.data.messageId, formData.get("override") === "on"));
}

// ---------- Reject ----------

const RejectSchema = z.object({
  messageId: z.uuid(),
  reason: z.string().trim().min(1).max(300),
});

async function performReject(userId: string, input: z.infer<typeof RejectSchema>): Promise<Outcome> {
  const { data: draft } = await supabase.from("outreach_messages").select("id, status").eq("id", input.messageId).maybeSingle();
  if (!draft) return { ok: false, error: "Email not found." };

  const current = draft.status as MessageStatus;
  if (!canTransition(current, "REJECTED")) return { ok: false, error: `A ${label(current)} email can't be rejected.` };

  const now = new Date().toISOString();
  const { data: rejected, error } = await supabase
    .from("outreach_messages")
    .update({
      status: "REJECTED",
      reject_reason: input.reason,
      reviewed_at: now,
      reviewed_by_id: userId,
      updated_at: now,
    })
    .eq("id", input.messageId)
    .eq("status", current)
    .select("id");

  if (error) {
    logger.error("rejectDraft failed", { error: error.message });
    return { ok: false, error: "Could not reject the email." };
  }
  if (!rejected || rejected.length === 0) return { ok: false, error: "This email changed. Reload it." };

  await logMessageEvent(input.messageId, "rejected", { user_id: userId, reason: input.reason });
  return { ok: true, message: "Rejected." };
}

export async function rejectDraft(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/crm/outreach");
  const parsed = RejectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(returnTo, { ok: false, error: describeZodError(parsed.error) });
  finish(returnTo, await performReject(user.id, parsed.data));
}

// ---------- Send (sandbox only) ----------

const SendSchema = z.object({ messageId: z.uuid() });

async function performSend(userId: string, messageId: string): Promise<Outcome> {
  const { data: message } = await supabase
    .from("outreach_messages")
    .select("id, status, subject, company_id, contact_id")
    .eq("id", messageId)
    .maybeSingle();

  if (!message) return { ok: false, error: "Email not found." };
  if (message.status !== "APPROVED") {
    return { ok: false, error: `This email is ${label(message.status)}, not approved.` };
  }

  const { data: contact } = await supabase
    .from("contacts")
    .select("email, do_not_contact")
    .eq("id", message.contact_id)
    .maybeSingle();

  if (contact?.do_not_contact) return { ok: false, error: "This contact is marked do not contact. Reject this email." };
  if (!contact?.email) return { ok: false, error: "This contact has no email address." };

  // Lock first, so two quick clicks can't both send. If the send fails, the
  // lock is released below so it can be retried.
  const { data: locked } = await supabase
    .from("outreach_messages")
    .update({ sending_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("status", "APPROVED")
    .is("sending_at", null)
    .select("id");
  if (!locked || locked.length === 0) return { ok: false, error: "This email is already being sent." };

  const releaseLock = async () => {
    await supabase.from("outreach_messages").update({ sending_at: null }).eq("id", messageId).eq("status", "APPROVED");
  };

  try {
    const result = await sendMessage(messageId);
    if (result.status !== "sent") {
      await releaseLock();
      return {
        ok: false,
        error: result.status === "blocked" ? result.reason : `Sending failed: ${result.error ?? "unknown error"}`,
      };
    }
  } catch (err) {
    await releaseLock();
    logger.error("sendApproved threw", { messageId, error: err instanceof Error ? err.message : "unknown" });
    return { ok: false, error: "Sending failed. Nothing was sent." };
  }

  await logMessageEvent(messageId, "sent_from_crm", { user_id: userId, sandbox: true });

  // Show the send on the deal's timeline too
  const { data: deals } = await supabase
    .from("opportunities")
    .select("id")
    .eq("company_id", message.company_id)
    .eq("contact_id", message.contact_id)
    .not("stage", "in", "(won,lost)")
    .limit(1);
  if (deals && deals.length > 0) {
    await logEvent(deals[0].id, userId, "email_sent", {
      metadata: { message_id: messageId, subject: message.subject, sandbox: true },
    });
  }

  return { ok: true, message: "Sent to the sandbox. Nothing was emailed to the contact." };
}

export async function sendApproved(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/crm/outreach");
  const parsed = SendSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(returnTo, { ok: false, error: describeZodError(parsed.error) });
  finish(returnTo, await performSend(user.id, parsed.data.messageId));
}