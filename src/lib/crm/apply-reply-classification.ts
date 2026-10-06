import { supabase } from "../supabase";
import { ReplyClassification } from "./classify-reply";
import { assertStageTransition, canTransitionStage, OpportunityStage } from "./opportunity-state-machine";
import { logger } from "../logger";

const CONFIDENCE_AUTO_APPLY = 0.8;

export async function applyReplyClassification(opportunityId: string, classification: ReplyClassification) {
  const { data: opp } = await supabase.from("opportunities").select("stage").eq("id", opportunityId).single();
  if (!opp) throw new Error("Opportunity not found");

  const currentStage = opp.stage as OpportunityStage;

  // Business rule: unsubscribe/not_interested → mark lost, regardless
  // of confidence, since acting cautiously here means fewer unwanted
  // messages, not more — the safer direction to err on.
  if (classification.intent === "unsubscribe" || classification.intent === "not_interested") {
    if (canTransitionStage(currentStage, "lost")) {
      await transition(opportunityId, currentStage, "lost", classification);
    }
    return { action: "marked_lost" as const };
  }

  // Business rule: "interested" only auto-applies above the confidence
  // threshold. Below it, log for human review but don't move the stage —
  // an uncertain "maybe interested" shouldn't silently change CRM state.
  if (classification.intent === "interested") {
    if (classification.confidence < CONFIDENCE_AUTO_APPLY) {
      logger.info("Low-confidence 'interested' classification — flagged, not auto-applied", { opportunityId, confidence: classification.confidence });
      return { action: "flagged_for_review" as const };
    }
    if (currentStage === "contacted" || currentStage === "follow_up") {
      await transition(opportunityId, currentStage, "replied", classification);
      await transition(opportunityId, "replied", "interested", classification);
      return { action: "advanced_to_interested" as const };
    }
  }

  // redirect/question/unclear: worth recording as a "replied" event, but
  // not a stage change the business rules here are confident enough to make.
  if (canTransitionStage(currentStage, "replied")) {
    await transition(opportunityId, currentStage, "replied", classification);
    return { action: "marked_replied" as const };
  }

  return { action: "no_change" as const };
}

async function transition(opportunityId: string, from: OpportunityStage, to: OpportunityStage, classification: ReplyClassification) {
  assertStageTransition(from, to);
  await supabase.from("opportunities").update({ stage: to, updated_at: new Date().toISOString() }).eq("id", opportunityId);
  await supabase.from("opportunity_events").insert({
    opportunity_id: opportunityId, event_type: "reply_classified", from_stage: from, to_stage: to,
    metadata: { intent: classification.intent, confidence: classification.confidence, reason: classification.reason },
  });
  logger.info("Opportunity stage changed from reply", { opportunityId, from, to, intent: classification.intent });
}