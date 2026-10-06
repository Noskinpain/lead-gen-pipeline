import { supabase } from "../supabase";
import { assertStageTransition, OpportunityStage } from "./opportunity-state-machine";
import { logger } from "../logger";

export async function syncOpportunityFromOutreach(companyId: string, contactId: string) {
  // Find an existing OPEN opportunity for this company+contact pair —
  // matches the partial unique index from Step 1's schema.
  const { data: existing } = await supabase
    .from("opportunities")
    .select("id, stage")
    .eq("company_id", companyId)
    .eq("contact_id", contactId)
    .not("stage", "in", "(won,lost)")
    .maybeSingle();

  if (existing) {
    // Advance it to "contacted" if it isn't already past that point.
    const currentStage = existing.stage as OpportunityStage;
    if (currentStage === "new" || currentStage === "qualified") {
      try {
        assertStageTransition(currentStage, "contacted");
      } catch {
        logger.warn("Cannot advance to contacted from current stage", { opportunityId: existing.id, currentStage });
        return { status: "unchanged" as const, opportunityId: existing.id };
      }

      await supabase.from("opportunities").update({ stage: "contacted", updated_at: new Date().toISOString() }).eq("id", existing.id);
      await supabase.from("opportunity_events").insert({
        opportunity_id: existing.id, event_type: "outreach_sent", from_stage: currentStage, to_stage: "contacted",
      });
      logger.info("Opportunity advanced to contacted", { opportunityId: existing.id });
      return { status: "advanced" as const, opportunityId: existing.id };
    }
    return { status: "unchanged" as const, opportunityId: existing.id };
  }

  // No existing open opportunity — create a new one, already at "contacted"
  // since we're calling this specifically because a message was sent.
  const { data: company } = await supabase.from("companies").select("company_name").eq("id", companyId).single();

  const { data: created, error } = await supabase
    .from("opportunities")
    .insert({ company_id: companyId, contact_id: contactId, name: `${company?.company_name ?? "Unknown"} — Opportunity`, stage: "contacted" })
    .select("id")
    .single();

  if (error || !created) {
    logger.error("Failed to create opportunity", { companyId, contactId, error: error?.message });
    return { status: "failed" as const, error: error?.message };
  }

  await supabase.from("opportunity_events").insert({
    opportunity_id: created.id, event_type: "outreach_sent", from_stage: "new", to_stage: "contacted",
  });

  logger.info("Opportunity created from outreach", { opportunityId: created.id });
  return { status: "created" as const, opportunityId: created.id };
}