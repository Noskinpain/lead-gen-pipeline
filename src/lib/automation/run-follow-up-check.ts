import { supabase } from "../supabase";
import { evaluateRules } from "./rules";
import { logger } from "../logger";

export async function runFollowUpCheck(opportunityId: string) {
  // CRITICAL: re-fetch the opportunity's CURRENT state right before acting,
  // not whatever state triggered this check to begin with. This is the
  // literal fix for Day 8's "dangerous case 1" — if a reply arrived while
  // this check was scheduled/waiting, this query sees it.
  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("id, stage, updated_at")
    .eq("id", opportunityId)
    .single();

  if (!opportunity) {
    logger.warn("Follow-up check: opportunity not found", { opportunityId });
    return { action: "none" as const, reason: "Opportunity not found" };
  }

  if (opportunity.stage !== "contacted") {
    // The prospect replied, the deal closed, or something else moved
    // this opportunity out of "waiting for a reply" — a follow-up is
    // no longer appropriate regardless of how long it's been.
    logger.info("Follow-up check: stage no longer eligible", { opportunityId, stage: opportunity.stage });
    return { action: "none" as const, reason: `Opportunity is now at stage '${opportunity.stage}', not eligible for follow-up` };
  }

  const daysSinceLastEvent = Math.floor((Date.now() - new Date(opportunity.updated_at).getTime()) / (1000 * 60 * 60 * 24));

  const matchedRules = evaluateRules("state_check", {
    opportunityId,
    opportunityStage: opportunity.stage,
    daysSinceLastEvent,
  });

  const followUpRule = matchedRules.find((r) => r.action.type === "create_follow_up");

  if (!followUpRule) {
    return { action: "none" as const, reason: `Not yet due (${daysSinceLastEvent} days since last event)` };
  }

  await supabase.from("opportunity_events").insert({
    opportunity_id: opportunityId, event_type: "follow_up_triggered", metadata: { daysSinceLastEvent },
  });

  logger.info("Follow-up triggered", { opportunityId, daysSinceLastEvent });
  return { action: "follow_up_triggered" as const, daysSinceLastEvent };
}