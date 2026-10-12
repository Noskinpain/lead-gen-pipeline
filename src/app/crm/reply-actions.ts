"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { describeZodError, safeReturnTo } from "@/lib/crm/form-helpers";
import { finish, logEvent, type Outcome } from "@/lib/crm/action-helpers";
import { classifyReply } from "@/lib/crm/classify-reply";
import { applyReplyClassification } from "@/lib/crm/apply-reply-classification";
import { canTransitionStage, isStage } from "@/lib/crm/opportunity-state-machine";
import { canTransition, type MessageStatus } from "@/lib/outreach/state-machine";
import { createTasksFromReplyEvent } from "@/lib/automation/create-task-from-event";
import { label } from "@/lib/crm/format";

const LogReplySchema = z.object({
  opportunityId: z.uuid(),
  body: z.string().trim().min(1).max(5000),
});

interface DealForReply {
  id: string;
  stage: string;
  company_id: string;
  contact_id: string | null;
  owner_id: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const ACTION_TEXT: Record<string, string> = {
  marked_lost: "Deal marked lost.",
  flagged_for_review: "Not confident enough to move the deal, so a review task was created.",
  advanced_to_interested: "Deal moved to interested.",
  marked_replied: "Deal moved to replied.",
  no_change: "Deal stage unchanged.",
  apply_failed: "Saved, but the rules could not be applied. A review task was created.",
};

// A review task for a human whenever the system could not or should not decide.
async function createReviewTask(replyId: string, deal: DealForReply, title: string, userId: string) {
  const { error } = await supabase.from("tasks").insert({
    opportunity_id: deal.id,
    company_id: deal.company_id,
    contact_id: deal.contact_id,
    assigned_to_id: deal.owner_id ?? userId,
    type: "review_reply",
    title,
    priority: "normal",
    status: "pending",
    due_at: new Date(Date.now() + DAY_MS).toISOString(),
    source_event_id: `${replyId}:review`,
  });
  // 23505 = this reply already has a review task. Fine.
  if (error && error.code !== "23505") logger.error("Review task failed", { replyId, error: error.message });
}

// Moves the outreach message along its real state path (SENT, DELIVERED,
// REPLIED, ...), one valid step at a time, recording each step.
async function advanceMessage(messageId: string, from: string, path: MessageStatus[], userId: string) {
  let current = from as MessageStatus;

  for (const target of path) {
    if (!canTransition(current, target)) break;

    const { data: updated, error } = await supabase
      .from("outreach_messages")
      .update({ status: target, updated_at: new Date().toISOString() })
      .eq("id", messageId)
      .eq("status", current)
      .select("id");
    if (error || !updated || updated.length === 0) break;

    await supabase.from("outreach_events").insert({
      message_id: messageId,
      event_type: target.toLowerCase(),
      event_data: { source: "manual_reply_log", logged_by: userId },
    });
    current = target;
  }
}

async function performLogReply(userId: string, input: z.infer<typeof LogReplySchema>): Promise<Outcome> {
  const { data: loaded, error: loadError } = await supabase
    .from("opportunities")
    .select("id, stage, company_id, contact_id, owner_id")
    .eq("id", input.opportunityId)
    .maybeSingle();

  if (loadError) {
    logger.error("logReply: load failed", { error: loadError.message });
    return { ok: false, error: "Could not load the deal." };
  }
  if (!loaded) return { ok: false, error: "Deal not found." };
  const deal = loaded as DealForReply;
  const stageBefore = deal.stage;

  // Same text logged twice within ten minutes is almost certainly a double click.
  const { data: duplicate } = await supabase
    .from("outreach_replies")
    .select("id")
    .eq("opportunity_id", deal.id)
    .eq("body", input.body)
    .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .limit(1);
  if (duplicate && duplicate.length > 0) return { ok: false, error: "That reply was already logged." };

  // The email this reply most likely answers
  let message: { id: string; status: string } | null = null;
  if (deal.contact_id) {
    const { data: messages } = await supabase
      .from("outreach_messages")
      .select("id, status")
      .eq("company_id", deal.company_id)
      .eq("contact_id", deal.contact_id)
      .in("status", ["SENT", "DELIVERED", "NO_REPLY"])
      .order("created_at", { ascending: false })
      .limit(1);
    message = messages?.[0] ?? null;
  }

  // Save the text first, so a classifier failure never loses the reply.
  const { data: reply, error: insertError } = await supabase
    .from("outreach_replies")
    .insert({
      message_id: message?.id ?? null,
      company_id: deal.company_id,
      contact_id: deal.contact_id,
      opportunity_id: deal.id,
      body: input.body,
      source: "manual",
      logged_by_id: userId,
    })
    .select("id")
    .single();

  if (insertError || !reply) {
    logger.error("logReply: insert failed", { error: insertError?.message });
    return { ok: false, error: "Could not save the reply." };
  }

  try {
    let classification = null as Awaited<ReturnType<typeof classifyReply>>;
    try {
      classification = await classifyReply(input.body);
    } catch (err) {
      logger.error("logReply: classifier threw", { error: err instanceof Error ? err.message : "unknown" });
    }

    let appliedAction: string;

    if (classification === null) {
      // The classifier failed. The reply still happened, so record that and hand it to a human.
      appliedAction = "needs_review";
      if (isStage(stageBefore) && canTransitionStage(stageBefore, "replied")) {
        const { data: moved } = await supabase
          .from("opportunities")
          .update({ stage: "replied", updated_at: new Date().toISOString() })
          .eq("id", deal.id)
          .eq("stage", stageBefore)
          .select("id");
        if (moved && moved.length > 0) {
          await logEvent(deal.id, userId, "stage_changed", {
            fromStage: stageBefore,
            toStage: "replied",
            metadata: { source: "reply_logged" },
          });
        }
      }
      await createReviewTask(reply.id, deal, "Review reply (the classifier could not read it)", userId);
    } else {
      // The model only interprets the text. Your rules decide what happens.
      let applied = "apply_failed";
      try {
        applied = (await applyReplyClassification(deal.id, classification)).action;
      } catch (err) {
        logger.error("logReply: applying rules failed", { error: err instanceof Error ? err.message : "unknown" });
      }
      appliedAction = applied;

      const taskResults = await createTasksFromReplyEvent(reply.id, deal.id, {
        opportunityId: deal.id,
        opportunityStage: stageBefore,
        daysSinceLastEvent: 0,
        replyClassification: { intent: classification.intent, confidence: classification.confidence },
      });
      const ruleCreatedTask = taskResults.some((r) => r.result === "created");

      if (applied === "apply_failed") {
        await createReviewTask(reply.id, deal, "Review reply (it could not be applied automatically)", userId);
      } else if (classification.requires_human_action && !ruleCreatedTask) {
        // The Day 8 rules only cover "interested" and "low confidence".
        // Anything else that needs a person (a redirect, a question) still gets a task.
        await createReviewTask(reply.id, deal, `Review reply: ${label(classification.intent)}`, userId);
      }

      // A deal closed by a reply gets the same closing details as a manual close.
      if (applied === "marked_lost" && stageBefore !== "lost") {
        const { data: after } = await supabase
          .from("opportunities")
          .select("closed_at, lost_reason")
          .eq("id", deal.id)
          .maybeSingle();
        await supabase
          .from("opportunities")
          .update({
            closed_at: after?.closed_at ?? new Date().toISOString(),
            lost_reason: after?.lost_reason ?? `Reply: ${label(classification.intent)}`,
          })
          .eq("id", deal.id);
      }

      // An unsubscribe always flags the contact, whatever the confidence.
      // Erring toward not emailing is the safe direction.
      if (classification.intent === "unsubscribe" && deal.contact_id) {
        const now = new Date().toISOString();
        const { data: flagged } = await supabase
          .from("contacts")
          .update({
            do_not_contact: true,
            do_not_contact_reason: `Unsubscribed by reply on ${now.slice(0, 10)}`,
            do_not_contact_at: now,
            updated_at: now,
          })
          .eq("id", deal.contact_id)
          .eq("do_not_contact", false)
          .select("id");
        if (flagged && flagged.length > 0) {
          await logEvent(deal.id, userId, "do_not_contact_changed", {
            metadata: { flag: true, reason: "Unsubscribed by reply", contact_id: deal.contact_id },
          });
        }
      }
    }

    if (message) {
      const path: MessageStatus[] = message.status === "SENT" ? ["DELIVERED", "REPLIED"] : ["REPLIED"];
      if (classification?.intent === "unsubscribe") path.push("UNSUBSCRIBED");
      await advanceMessage(message.id, message.status, path, userId);
    }

    await supabase
      .from("outreach_replies")
      .update({
        intent: classification?.intent ?? null,
        confidence: classification?.confidence ?? null,
        classifier_reason: classification?.reason ?? null,
        applied_action: appliedAction,
      })
      .eq("id", reply.id);

    await logEvent(deal.id, userId, "reply_logged", {
      metadata: {
        reply_id: reply.id,
        intent: classification?.intent ?? null,
        confidence: classification?.confidence ?? null,
        action: appliedAction,
        message_id: message?.id ?? null,
      },
    });

    const intentText = classification
      ? `${label(classification.intent)} (${Math.round(classification.confidence * 100)}%)`
      : "not classified";
    const actionText = ACTION_TEXT[appliedAction] ?? "A review task was created.";
    return { ok: true, message: `Reply logged: ${intentText}. ${actionText}` };
  } catch (err) {
    logger.error("logReply: failed after saving", { error: err instanceof Error ? err.message : "unknown" });
    await supabase.from("outreach_replies").update({ applied_action: "error" }).eq("id", reply.id);
    return { ok: false, error: "The reply was saved, but applying it failed. Check the deal and add a task by hand." };
  }
}

export async function logReply(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/crm/pipeline");
  const parsed = LogReplySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(returnTo, { ok: false, error: describeZodError(parsed.error) });
  finish(returnTo, await performLogReply(user.id, parsed.data));
}